import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';
import { authLimiter } from '../middlewares/rateLimitMiddleware';
import { RegisterSchema, LoginSchema } from '../utils/validationSchemas';
import { sanitizeEmail } from '../utils/sanitization';
import { logger, logAuthFailure } from '../utils/logger';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';

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
      select: { id: true, email: true, plan: true },
    });

    const token = signToken(user.id, user.email, user.plan);
    logger.info('User registered', { userId: user.id, email: sanitizedEmail.slice(0, 3) + '***' });

    res.status(201).json({ token, user });
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
      user: { id: user.id, email: user.email, plan: user.plan, usageCount: user.usageCount },
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
    select: { id: true, email: true, plan: true, usageCount: true, usageResetAt: true },
  });

  if (!user) {
    res.status(401).json({ error: 'Usuário não encontrado.' });
    return;
  }

  res.json(user);
});

export { router as authRouter };
