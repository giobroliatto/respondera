import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';

const router = Router();
const prisma = new PrismaClient();

const VALID_TONES = ['FORMAL', 'NEUTRO', 'DESCONTRAÍDO'];

// Todas as rotas de business exigem autenticação
router.use(authMiddleware);

// GET /business — retorna o único estabelecimento do usuário autenticado
router.get('/', async (req: AuthRequest, res: Response) => {
  const business = await prisma.business.findUnique({
    where: { userId: req.user!.id },
  });

  if (!business) {
    res.status(404).json({ error: 'Nenhum estabelecimento cadastrado ainda.' });
    return;
  }

  res.json({ business });
});

// POST /business — cria ou atualiza o único estabelecimento do usuário (upsert)
router.post('/', async (req: AuthRequest, res: Response) => {
  const { name, segment, tone, avgTicket, highlights } = req.body as {
    name?: string;
    segment?: string;
    tone?: string;
    avgTicket?: string;
    highlights?: string;
  };

  if (!name || !segment) {
    res.status(400).json({ error: 'Nome e segmento são obrigatórios.' });
    return;
  }

  if (tone && !VALID_TONES.includes(tone)) {
    res.status(400).json({ error: `Tom inválido. Use: ${VALID_TONES.join(', ')}.` });
    return;
  }

  const business = await prisma.business.upsert({
    where: { userId: req.user!.id },
    create: {
      userId: req.user!.id,
      name,
      segment,
      tone: tone ?? 'NEUTRO',
      avgTicket: avgTicket ?? null,
      highlights: highlights ?? null,
    },
    update: {
      name,
      segment,
      ...(tone && { tone }),
      avgTicket: avgTicket !== undefined ? avgTicket : undefined,
      highlights: highlights !== undefined ? highlights : undefined,
    },
  });

  res.status(200).json({ business });
});

export { router as businessRouter };

