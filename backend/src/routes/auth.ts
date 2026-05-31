import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';

const router = Router();
const prisma = new PrismaClient();
const SALT_ROUNDS = 12;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(userId: string, email: string, plan: string): string {
  return jwt.sign(
    { userId, email, plan },
    process.env.JWT_SECRET as string,
    { expiresIn: '30d' }
  );
}

// POST /auth/register
router.post('/register', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    return;
  }

  if (!EMAIL_REGEX.test(email)) {
    res.status(400).json({ error: 'E-mail inválido.' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres.' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'E-mail já cadastrado.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: { email, passwordHash },
    select: { id: true, email: true, plan: true },
  });

  const token = signToken(user.id, user.email, user.plan);

  res.status(201).json({ token, user });
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Tempo constante para evitar user enumeration
  const passwordMatch = user
    ? await bcrypt.compare(password, user.passwordHash)
    : await bcrypt.hash(password, SALT_ROUNDS).then(() => false);

  if (!user || !passwordMatch) {
    res.status(401).json({ error: 'Credenciais inválidas.' });
    return;
  }

  const token = signToken(user.id, user.email, user.plan);

  res.json({
    token,
    user: { id: user.id, email: user.email, plan: user.plan, usageCount: user.usageCount },
  });
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
