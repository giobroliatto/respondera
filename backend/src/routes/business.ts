import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';
import { BusinessSchema } from '../utils/validationSchemas';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';

const router = Router();

// Todas as rotas de business exigem autenticação
router.use(authMiddleware);

// GET /business — retorna o único estabelecimento do usuário autenticado
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const business = await prisma.business.findUnique({
      where: { userId: req.user!.id },
    });

    if (!business) {
      res.status(404).json({ error: 'Nenhum estabelecimento cadastrado ainda.' });
      return;
    }

    res.json({ business });
  } catch (err: any) {
    logger.error('Business fetch error', { userId: req.user!.id.slice(0, 8), error: err.message });
    res.status(500).json({ error: 'Erro ao buscar estabelecimento.' });
  }
});

// POST /business — cria ou atualiza o único estabelecimento do usuário (upsert)
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const validatedData = BusinessSchema.parse(req.body);
    const { name, segment, tone, avgTicket, highlights, soloOperator, soloGender, defaultCustomToneId } = validatedData;

    const business = await prisma.business.upsert({
      where: { userId: req.user!.id },
      create: {
        userId: req.user!.id,
        name,
        segment,
        tone: tone ?? 'NEUTRO',
        avgTicket: avgTicket ?? null,
        highlights: highlights ?? null,
        soloOperator: soloOperator ?? false,
        soloGender: soloGender ?? null,
        defaultCustomToneId: defaultCustomToneId ?? null,
      },
      update: {
        name,
        segment,
        ...(tone && { tone }),
        avgTicket: avgTicket !== undefined ? avgTicket : undefined,
        highlights: highlights !== undefined ? highlights : undefined,
        soloOperator: soloOperator !== undefined ? soloOperator : undefined,
        soloGender: soloGender !== undefined ? soloGender : undefined,
        defaultCustomToneId: defaultCustomToneId !== undefined ? defaultCustomToneId : undefined,
      },
    });

    logger.info('Business updated', {
      userId: req.user!.id.slice(0, 8),
      segment,
    });

    res.status(200).json({ business });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: err.issues?.[0]?.message || 'Validation error' });
    } else {
      logger.error('Business creation error', { userId: req.user!.id.slice(0, 8), error: err.message });
      res.status(500).json({ error: 'Erro ao salvar estabelecimento.' });
    }
  }
});

export { router as businessRouter };


