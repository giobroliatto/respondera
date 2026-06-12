import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';
import { CustomToneCreateSchema, CustomToneUpdateSchema } from '../utils/validationSchemas';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';

const router = Router();

router.use(authMiddleware);

// GET /custom-tones
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const tones = await prisma.customTone.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, description: true },
    });
    res.json({ tones });
  } catch (err: any) {
    logger.error('CustomTone fetch error', { userId: req.user!.id.slice(0, 8), error: err.message });
    res.status(500).json({ error: 'Erro ao buscar tons personalizados.' });
  }
});

// POST /custom-tones — PRO only, max 8
router.post('/', async (req: AuthRequest, res: Response) => {
  if (req.user!.plan !== 'PRO') {
    res.status(403).json({ error: 'PRO_REQUIRED', message: 'Tons personalizados disponíveis apenas no plano PRO.' });
    return;
  }

  try {
    const { name, description } = CustomToneCreateSchema.parse(req.body);

    const count = await prisma.customTone.count({ where: { userId: req.user!.id } });
    if (count >= 8) {
      res.status(400).json({ error: 'Limite de 8 tons personalizados atingido.' });
      return;
    }

    const tone = await prisma.customTone.create({
      data: { userId: req.user!.id, name, description, position: count },
      select: { id: true, name: true, description: true },
    });

    logger.info('CustomTone created', { userId: req.user!.id.slice(0, 8) });
    res.status(201).json({ tone });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: err.issues?.[0]?.message || 'Validation error' });
    } else {
      logger.error('CustomTone create error', { userId: req.user!.id.slice(0, 8), error: err.message });
      res.status(500).json({ error: 'Erro ao criar tom personalizado.' });
    }
  }
});

// PUT /custom-tones/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, description } = CustomToneUpdateSchema.parse(req.body);

    const existing = await prisma.customTone.findFirst({
      where: { id: String(req.params['id']), userId: req.user!.id },
    });
    if (!existing) {
      res.status(404).json({ error: 'Tom não encontrado.' });
      return;
    }

    const tone = await prisma.customTone.update({
      where: { id: String(req.params['id']) },
      data: { name, description },
      select: { id: true, name: true, description: true },
    });

    res.json({ tone });
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: err.issues?.[0]?.message || 'Validation error' });
    } else {
      logger.error('CustomTone update error', { userId: req.user!.id.slice(0, 8), error: err.message });
      res.status(500).json({ error: 'Erro ao atualizar tom personalizado.' });
    }
  }
});

// DELETE /custom-tones/:id — returns 200 { success: true } (not 204) for apiFetch compatibility
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.customTone.findFirst({
      where: { id: String(req.params['id']), userId: req.user!.id },
    });
    if (!existing) {
      res.status(404).json({ error: 'Tom não encontrado.' });
      return;
    }

    await prisma.customTone.delete({ where: { id: String(req.params['id']) } });

    res.json({ success: true });
  } catch (err: any) {
    logger.error('CustomTone delete error', { userId: req.user!.id.slice(0, 8), error: err.message });
    res.status(500).json({ error: 'Erro ao excluir tom personalizado.' });
  }
});

export { router as customTonesRouter };
