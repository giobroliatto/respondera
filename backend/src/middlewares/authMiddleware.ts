import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';

export interface AuthUser {
  id: string;
  email: string;
  plan: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
  usageInfo?: { count: number; limit: number };
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação não fornecido.' });
    return;
  }

  const token = authHeader.slice(7);

  let payload: { userId: string; email: string; plan: string; iat?: number };
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as typeof payload;
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado.' });
    return;
  }

  // Verifica se o token foi invalidado por logout posterior
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { tokenInvalidatedAt: true, plan: true },
  });

  if (!user) {
    res.status(401).json({ error: 'Usuário não encontrado.' });
    return;
  }

  if (user.tokenInvalidatedAt && payload.iat) {
    const invalidatedAtMs = user.tokenInvalidatedAt.getTime();
    const tokenIssuedAtMs = payload.iat * 1000; // iat é em segundos
    if (tokenIssuedAtMs < invalidatedAtMs) {
      res.status(401).json({ error: 'Sessão encerrada. Faça login novamente.' });
      return;
    }
  }

  req.user = { id: payload.userId, email: payload.email, plan: user.plan };
  next();
}
