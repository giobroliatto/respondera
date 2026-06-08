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
    select: { id: true, email: true, plan: true, usageCount: true, usageResetAt: true, emailVerifiedAt: true, mpNextBillingDate: true },
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

  const page = (
    icon: string,
    title: string,
    body: string,
    statusCode: number = 200,
  ) => {
    res.status(statusCode).send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Respondera</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0A0A0A;
      color: #F0F0F0;
      font-family: 'DM Sans', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .card {
      background: #141414;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px;
      padding: 3rem 2.5rem;
      max-width: 420px;
      width: 100%;
      text-align: center;
    }
    .logo {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 1.75rem;
      letter-spacing: 0.05em;
      color: #F0F0F0;
      margin-bottom: 2rem;
    }
    .logo span { color: #10B981; }
    .icon {
      font-size: 3rem;
      line-height: 1;
      margin-bottom: 1.25rem;
    }
    h1 {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 1.75rem;
      letter-spacing: 0.03em;
      margin-bottom: 0.75rem;
      color: #F0F0F0;
    }
    p {
      font-size: 0.95rem;
      color: #6B6B6B;
      line-height: 1.6;
    }
    .divider {
      border: none;
      border-top: 1px solid rgba(255,255,255,0.08);
      margin: 1.75rem 0;
    }
    .hint {
      font-size: 0.8rem;
      color: #444;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">RESPOND<span>ERA</span></div>
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${body}</p>
    <hr class="divider" />
    <p class="hint">Pode fechar esta aba e voltar para a extensão.</p>
  </div>
</body>
</html>`);
  };

  if (!token) {
    page('🔗', 'Link inválido', 'Este link de confirmação não é válido. Verifique se você copiou o endereço completo.', 400);
    return;
  }

  const result = await verifyEmailToken(token);

  if (result === 'verified') {
    page('✅', 'E-mail confirmado!', 'Estamos prontos quando você estiver.');
    return;
  }

  if (result === 'expired') {
    page('⏰', 'Link expirado', 'Este link de confirmação expirou. Volte para a extensão e solicite um novo e-mail de confirmação.', 400);
    return;
  }

  page('🔗', 'Link inválido', 'Este link de confirmação não é válido. Verifique se você copiou o endereço completo.', 400);
});

// POST /auth/logout
router.post('/logout', authMiddleware, async (req: AuthRequest, res: Response) => {
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { tokenInvalidatedAt: new Date() },
  });
  res.json({ message: 'Sessão encerrada.' });
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
