import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';
import { authLimiter, emailVerificationLimiter } from '../middlewares/rateLimitMiddleware';
import { RegisterSchema, LoginSchema } from '../utils/validationSchemas';
import { sanitizeEmail } from '../utils/sanitization';
import { logger, logAuthFailure } from '../utils/logger';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import {
  createAndSendVerificationEmail,
  verifyEmailToken,
} from '../services/emailVerificationService';

const router = Router();
const SALT_ROUNDS = 12;

function signToken(userId: string, email: string, plan: string): string {
  return jwt.sign(
    { userId, email, plan },
    env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// POST /auth/register
router.post('/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const validatedData = RegisterSchema.parse(req.body);
    const { email, password } = validatedData;

    const sanitizedEmail = sanitizeEmail(email);

    const existing = await prisma.user.findUnique({ where: { email: sanitizedEmail } });
    if (existing) {
      logAuthFailure(sanitizedEmail, 'Email already registered');
      res.status(409).json({ error: 'E-mail já cadastrado.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: { email: sanitizedEmail, passwordHash },
      select: { id: true, email: true, plan: true, usageCount: true, emailVerifiedAt: true },
    });

    const token = signToken(user.id, user.email, user.plan);
    try {
      await createAndSendVerificationEmail(user.id, user.email);
    } catch (emailErr: any) {
      logger.error('Email verification send failed', {
        userId: user.id.slice(0, 8),
        error: emailErr.message?.slice(0, 200),
      });
    }

    logger.info('User registered', { userId: user.id, email: sanitizedEmail.slice(0, 3) + '***' });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        usageCount: user.usageCount,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
      message: 'Conta criada. Confirme seu e-mail para liberar a geração de respostas.',
    });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      const msg = err.issues?.[0]?.message ?? 'Validation error';
      res.status(400).json({ error: msg });
    } else {
      logger.error('Registration error', { error: err.message });
      res.status(500).json({ error: 'Erro ao registrar. Tente novamente.' });
    }
  }
});

// POST /auth/login
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const validatedData = LoginSchema.parse(req.body);
    const { email, password } = validatedData;
    const sanitizedEmail = sanitizeEmail(email);

    const user = await prisma.user.findUnique({ where: { email: sanitizedEmail } });

    // Tempo constante para evitar user enumeration
    const passwordMatch = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.hash(password, SALT_ROUNDS).then(() => false);

    if (!user || !passwordMatch) {
      logAuthFailure(sanitizedEmail, 'Invalid credentials');
      res.status(401).json({ error: 'Credenciais inválidas.' });
      return;
    }

    const token = signToken(user.id, user.email, user.plan);
    logger.info('User login', { userId: user.id, email: sanitizedEmail.slice(0, 3) + '***' });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        usageCount: user.usageCount,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
    });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      const msg = err.issues?.[0]?.message ?? 'Validation error';
      res.status(400).json({ error: msg });
    } else {
      logger.error('Login error', { error: err.message });
      res.status(500).json({ error: 'Erro ao fazer login. Tente novamente.' });
    }
  }
});

// GET /auth/me
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, plan: true, usageCount: true, usageResetAt: true, emailVerifiedAt: true },
  });

  if (!user) {
    res.status(401).json({ error: 'Usuário não encontrado.' });
    return;
  }

  res.json({
    ...user,
    emailVerified: Boolean(user.emailVerifiedAt),
    emailVerifiedAt: undefined,
  });
});

// GET /auth/verify-email?token=...
router.get('/verify-email', async (req: Request, res: Response) => {
  const token = typeof req.query['token'] === 'string' ? req.query['token'] : '';
  if (!token) {
    res.status(400).send('Link de confirmação inválido.');
    return;
  }

  const result = await verifyEmailToken(token);

  if (result === 'verified') {
    res.send('E-mail confirmado com sucesso. Você já pode voltar para a extensão Respondera.');
    return;
  }

  if (result === 'expired') {
    res.status(400).send('Este link expirou. Volte para a extensão e solicite um novo e-mail.');
    return;
  }

  res.status(400).send('Link de confirmação inválido.');
});

// POST /auth/resend-verification
router.post('/resend-verification', authMiddleware, emailVerificationLimiter, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, emailVerifiedAt: true },
  });

  if (!user) {
    res.status(401).json({ error: 'Usuário não encontrado.' });
    return;
  }

  if (user.emailVerifiedAt) {
    res.json({ message: 'E-mail já confirmado.', emailVerified: true });
    return;
  }

  try {
    await createAndSendVerificationEmail(user.id, user.email);
    res.json({ message: 'Novo e-mail de confirmação enviado.', emailVerified: false });
  } catch (err: any) {
    logger.error('Verification resend failed', {
      userId: user.id.slice(0, 8),
      error: err.message?.slice(0, 200),
    });
    res.status(500).json({ error: 'Erro ao reenviar confirmação. Tente novamente.' });
  }
});

export { router as authRouter };
