import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';
import { usageLimitMiddleware } from '../middlewares/usageLimitMiddleware';
import { generateReply } from '../services/anthropicService';
import { incrementUsage } from '../services/usageService';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

const VALID_TONES = ['formal', 'friendly', 'empathetic'] as const;
type Tone = typeof VALID_TONES[number];

router.use(authMiddleware);

// POST /reply/generate
router.post('/generate', usageLimitMiddleware, async (req: AuthRequest, res: Response) => {
  const { reviewText, rating, reviewerName, tone, detailRatings, additionalContext } = req.body as {
    reviewText?: string;
    rating?: number;
    reviewerName?: string;
    tone?: string;
    detailRatings?: Record<string, string>;
    additionalContext?: string | null;
  };

  // reviewText é opcional — avaliações sem comentário são válidas
  // O serviço gera resposta baseada apenas na nota quando não há texto

  // Sanitiza additionalContext: remove tags HTML e limita a 300 caracteres
  const sanitizedAdditionalContext = additionalContext
    ? additionalContext.replace(/<[^>]*>/g, '').trim().slice(0, 300) || null
    : null;

  if (rating === undefined || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    res.status(400).json({ error: 'rating deve ser um número inteiro entre 1 e 5.' });
    return;
  }

  if (tone && !VALID_TONES.includes(tone as Tone)) {
    res.status(400).json({ error: `tone inválido. Use: ${VALID_TONES.join(', ')}.` });
    return;
  }

  // Busca o único estabelecimento do usuário (relação 1-para-1)
  const business = await prisma.business.findUnique({
    where: { userId: req.user!.id },
  });

  // Gera a resposta mesmo sem contexto de estabelecimento, mas avisa
  const contextWarning = !business
    ? 'Resposta gerada sem contexto de estabelecimento. Cadastre seu negócio para respostas mais personalizadas.'
    : undefined;

  const { reply, tokensUsed } = await generateReply({
    reviewText: reviewText ?? '',
    rating,
    reviewerName,
    tone: (tone as Tone) ?? 'friendly',
    detailRatings,
    additionalContext: sanitizedAdditionalContext,
    businessContext: business
      ? {
          name: business.name,
          segment: business.segment,
          avgTicket: business.avgTicket,
          highlights: business.highlights,
        }
      : null,
  });

  await incrementUsage(req.user!.id);

  const { count, limit } = req.usageInfo!;
  const remainingUsage = limit - (count + 1);

  res.json({
    reply,
    tokensUsed,
    remainingUsage: Math.max(0, remainingUsage),
    ...(contextWarning && { contextWarning }),
  });
});

export { router as replyRouter };
