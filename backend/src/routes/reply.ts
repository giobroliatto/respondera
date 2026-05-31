import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';
import { usageLimitMiddleware } from '../middlewares/usageLimitMiddleware';
import { generateReply } from '../services/anthropicService';
import { incrementUsage } from '../services/usageService';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);
router.use(usageLimitMiddleware);

// POST /reply
router.post('/', async (req: AuthRequest, res: Response) => {
  const { reviewText, reviewerName, starRating, businessId } = req.body as {
    reviewText?: string;
    reviewerName?: string;
    starRating?: number;
    businessId?: string;
  };

  if (!reviewText || !businessId) {
    res.status(400).json({ error: 'reviewText e businessId são obrigatórios.' });
    return;
  }

  const business = await prisma.business.findFirst({
    where: { id: businessId, userId: req.user!.id },
  });

  if (!business) {
    res.status(404).json({ error: 'Estabelecimento não encontrado.' });
    return;
  }

  const reply = await generateReply({
    reviewText,
    reviewerName: reviewerName ?? 'Cliente',
    starRating: starRating ?? 5,
    business,
  });

  await incrementUsage(req.user!.id);

  res.json({ reply });
});

export { router as replyRouter };
