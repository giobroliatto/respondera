import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';
import { usageLimitMiddleware } from '../middlewares/usageLimitMiddleware';
import { replyGenerationLimiter } from '../middlewares/rateLimitMiddleware';
import { generateReply } from '../services/anthropicService';
import { incrementUsage } from '../services/usageService';
import { GenerateReplySchema } from '../utils/validationSchemas';
import { sanitizeReviewText, sanitizeAdditionalContext } from '../utils/sanitization';
import { logger, logReplyGenerationError } from '../utils/logger';
import { prisma } from '../lib/prisma';

const router = Router();

router.use(authMiddleware);

// POST /reply/generate
router.post('/generate', replyGenerationLimiter, usageLimitMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const validatedData = GenerateReplySchema.parse(req.body);
    const { reviewText, rating, reviewerName, tone, customTone, detailRatings, additionalContext } = validatedData;

    // Sanitiza inputs
    const sanitizedReviewText = sanitizeReviewText(reviewText);
    const sanitizedAdditionalContext = sanitizeAdditionalContext(additionalContext);

    // Busca o único estabelecimento do usuário (relação 1-para-1)
    const business = await prisma.business.findUnique({
      where: { userId: req.user!.id },
    });

    // Gera a resposta mesmo sem contexto de estabelecimento, mas avisa
    const contextWarning = !business
      ? 'Resposta gerada sem contexto de estabelecimento. Cadastre seu negócio para respostas mais personalizadas.'
      : undefined;

    const { reply, tokensUsed } = await generateReply({
      reviewText: sanitizedReviewText,
      rating,
      reviewerName,
      tone: (tone as any) ?? 'friendly',
      customTone: customTone ? customTone.replace(/<[^>]*>/g, '').trim().slice(0, 100) : null,
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

    logger.info('Reply generated', {
      userId: req.user!.id.slice(0, 8),
      rating,
      tokensUsed,
    });

    res.json({
      reply,
      tokensUsed,
      remainingUsage: Math.max(0, remainingUsage),
      ...(contextWarning && { contextWarning }),
    });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: err.issues?.[0]?.message || 'Validation error' });
    } else {
      logReplyGenerationError(req.user!.id, err.message, req.body.rating);
      res.status(500).json({ error: 'Erro ao gerar resposta. Tente novamente.' });
    }
  }
});

export { router as replyRouter };
