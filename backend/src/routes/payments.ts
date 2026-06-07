import { Router, Request, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';
import { createSubscription, getSubscription, verifyWebhookSignature } from '../services/mercadoPagoService';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

const router = Router();

// ─── POST /payments/create-subscription ──────────────────────────────────────
// Autenticada — cria assinatura no MP e retorna URL de checkout
router.post('/create-subscription', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const userEmail = req.user!.email;

    // Se já tem assinatura ativa, não cria outra
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, mpSubscriptionStatus: true },
    });

    if (user?.plan === 'PRO' && user.mpSubscriptionStatus === 'authorized') {
      res.status(400).json({ error: 'Você já possui o plano PRO ativo.' });
      return;
    }

    const { subscriptionId, checkoutUrl } = await createSubscription(userId, userEmail);

    // Salva o ID da assinatura pendente
    await prisma.user.update({
      where: { id: userId },
      data: {
        mpSubscriptionId: subscriptionId,
        mpSubscriptionStatus: 'pending',
      },
    });

    logger.info('Subscription created', { userId: userId.slice(0, 8), subscriptionId });

    res.json({ checkoutUrl });
  } catch (err: any) {
    logger.error('create-subscription error', { message: err.message });
    res.status(500).json({ error: 'Erro ao criar assinatura. Tente novamente.' });
  }
});

// ─── POST /payments/webhook ───────────────────────────────────────────────────
// Pública — recebe notificações do Mercado Pago
router.post('/webhook', async (req: Request, res: Response) => {
  // Responde 200 imediatamente para o MP não retentar
  res.sendStatus(200);

  try {
    const xSignature  = req.headers['x-signature'] as string | undefined;
    const xRequestId  = req.headers['x-request-id'] as string | undefined;
    const dataId      = req.query['data.id'] as string | undefined ?? req.body?.data?.id;
    const topic       = req.query['type'] as string | undefined ?? req.body?.type;

    // Verifica assinatura
    if (!verifyWebhookSignature(xSignature, xRequestId, dataId)) {
      logger.warn('Webhook signature invalid', { xSignature, dataId });
      return;
    }

    // Só processa eventos de assinatura
    if (topic !== 'subscription_preapproval') return;
    if (!dataId) return;

    const subscription = await getSubscription(dataId);
    const { status, external_reference: userId } = subscription;

    if (!userId) {
      logger.warn('Webhook missing external_reference', { dataId });
      return;
    }

    // Determina novo plano com base no status da assinatura
    const isPro = status === 'authorized';

    await prisma.user.update({
      where: { id: userId },
      data: {
        plan: isPro ? 'PRO' : 'FREE',
        mpSubscriptionId: subscription.id,
        mpSubscriptionStatus: status,
      },
    });

    logger.info('Webhook processed', {
      userId: userId.slice(0, 8),
      status,
      plan: isPro ? 'PRO' : 'FREE',
    });
  } catch (err: any) {
    logger.error('Webhook processing error', { message: err.message });
  }
});

export { router as paymentsRouter };
