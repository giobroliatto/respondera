import { Router, Request, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';
import { createSubscription, getSubscription, cancelSubscription, resumeSubscription, verifyWebhookSignature } from '../services/mercadoPagoService';
import { sendProWelcomeEmail } from '../services/proWelcomeEmailService';
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
    const { status, external_reference: userId, next_payment_date } = subscription;

    if (!userId) {
      logger.warn('Webhook missing external_reference', { dataId });
      return;
    }

    const isPro = status === 'authorized';

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, email: true },
    });

    // paused = cancelado pelo usuário mas ainda no período pago → mantém PRO
    // cancelled = encerrado definitivamente → FREE
    const keepPro = status === 'paused' && currentUser?.plan === 'PRO';
    const newPlan = isPro || keepPro ? 'PRO' : 'FREE';

    await prisma.user.update({
      where: { id: userId },
      data: {
        plan: newPlan,
        mpSubscriptionId: subscription.id,
        mpSubscriptionStatus: status,
        mpNextBillingDate: next_payment_date ? new Date(next_payment_date) : null,
      },
    });

    // Envia email de boas-vindas na primeira vez que vira PRO
    if (isPro && currentUser?.plan !== 'PRO' && currentUser?.email) {
      await sendProWelcomeEmail(currentUser.email);
    }

    logger.info('Webhook processed', {
      userId: userId.slice(0, 8),
      status,
      plan: isPro ? 'PRO' : 'FREE',
    });
  } catch (err: any) {
    logger.error('Webhook processing error', { message: err.message });
  }
});

// ─── POST /payments/cancel-subscription ──────────────────────────────────────
router.post('/cancel-subscription', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { plan: true, mpSubscriptionId: true, mpSubscriptionStatus: true, mpNextBillingDate: true },
    });

    if (!user || user.plan !== 'PRO') {
      res.status(400).json({ error: 'Nenhuma assinatura PRO ativa encontrada.' });
      return;
    }

    if (user.mpSubscriptionStatus === 'paused' || user.mpSubscriptionStatus === 'cancelled') {
      res.status(400).json({ error: 'Assinatura já está cancelada.' });
      return;
    }

    if (!user.mpSubscriptionId) {
      res.status(400).json({ error: 'ID da assinatura não encontrado.' });
      return;
    }

    await cancelSubscription(user.mpSubscriptionId);

    // Pausa no MP (reversível). Localmente marcamos como 'paused' para poder retomar.
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { mpSubscriptionStatus: 'paused' },
    });

    logger.info('Subscription cancelled', { userId: req.user!.id });

    res.json({
      message: 'Assinatura cancelada. Você mantém acesso PRO até a próxima data de renovação.',
      accessUntil: user.mpNextBillingDate,
    });
  } catch (err: any) {
    logger.error('Cancel subscription error', { error: err.message });
    res.status(500).json({ error: 'Erro ao cancelar assinatura. Tente novamente.' });
  }
});

// ─── POST /payments/resume-subscription ──────────────────────────────────────
router.post('/resume-subscription', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { plan: true, mpSubscriptionId: true, mpSubscriptionStatus: true },
    });

    if (!user || user.plan !== 'PRO') {
      res.status(400).json({ error: 'Nenhuma assinatura PRO encontrada.' });
      return;
    }

    if (user.mpSubscriptionStatus !== 'paused') {
      res.status(400).json({ error: 'Assinatura não está pausada.' });
      return;
    }

    if (!user.mpSubscriptionId) {
      res.status(400).json({ error: 'ID da assinatura não encontrado.' });
      return;
    }

    await resumeSubscription(user.mpSubscriptionId);

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { mpSubscriptionStatus: 'authorized' },
    });

    logger.info('Subscription resumed', { userId: req.user!.id });

    res.json({ message: 'Assinatura retomada. A cobrança volta no próximo ciclo.' });
  } catch (err: any) {
    logger.error('Resume subscription error', { error: err.message });
    res.status(500).json({ error: 'Erro ao retomar assinatura. Tente novamente.' });
  }
});

export { router as paymentsRouter };
