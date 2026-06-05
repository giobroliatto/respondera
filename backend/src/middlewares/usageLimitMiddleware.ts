import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';
import { prisma } from '../lib/prisma';

// Limites por plano — não expor esses valores nas respostas da API
const PLAN_LIMITS: Record<string, number> = {
  FREE: 10,
  PRO: 200,
};

export async function usageLimitMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { plan: true, usageCount: true, usageResetAt: true, emailVerifiedAt: true },
  });

  if (!user) {
    res.status(401).json({ error: 'Usuário não encontrado.' });
    return;
  }

  if (!user.emailVerifiedAt) {
    res.status(403).json({
      error: 'EMAIL_NOT_VERIFIED',
      message: 'Confirme seu e-mail antes de gerar respostas.',
    });
    return;
  }

  // Validação de tons exclusivos PRO
  const PRO_ONLY_TONES = ['direct', 'casual', 'assertive', 'custom'];
  if (PRO_ONLY_TONES.includes(req.body?.tone) && user.plan === 'FREE') {
    res.status(403).json({
      error: 'PRO_REQUIRED',
      message: 'Este tom está disponível apenas no plano PRO.',
    });
    return;
  }

  // Reinicia o contador se já passou um mês desde o último reset
  const now = new Date();
  const resetAt = new Date(user.usageResetAt);
  const monthElapsed =
    now.getFullYear() > resetAt.getFullYear() ||
    now.getMonth() > resetAt.getMonth();

  if (monthElapsed) {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { usageCount: 0, usageResetAt: now },
    });
    user.usageCount = 0;
  }

  const limit = PLAN_LIMITS[user.plan] ?? PLAN_LIMITS['FREE'];

  if (user.usageCount >= limit) {
    res.status(403).json({
      error: 'USAGE_LIMIT_REACHED',
      message: 'Você atingiu o limite de respostas deste mês.',
    });
    return;
  }

  // Injeta info de uso no req para que a rota compute remainingUsage sem query extra
  req.usageInfo = { count: user.usageCount, limit };

  next();
}
