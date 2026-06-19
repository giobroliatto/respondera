import { Router, Request, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middlewares/authMiddleware';
import {
  createCheckoutSession,
  cancelSubscription,
  reactivateSubscription,
  getSubscription,
  constructWebhookEvent,
} from '../services/stripeService';
import { sendProWelcomeEmail } from '../services/proWelcomeEmailService';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { env } from '../config/env';

const router = Router();

type StripeEvent = ReturnType<typeof constructWebhookEvent>;
type StripeSub  = Awaited<ReturnType<typeof getSubscription>>;

// ─── POST /payments/create-subscription ──────────────────────────────────────
router.post('/create-subscription', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId    = req.user!.id;
    const userEmail = req.user!.email;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, mpSubscriptionStatus: true },
    });

    if (user?.plan === 'PRO' && user.mpSubscriptionStatus === 'authorized') {
      res.status(400).json({ error: 'Você já possui o plano PRO ativo.' });
      return;
    }

    const { checkoutUrl } = await createCheckoutSession(userId, userEmail);

    logger.info('Checkout session created', { userId: userId.slice(0, 8) });

    res.json({ checkoutUrl });
  } catch (err: any) {
    logger.error('create-subscription error', { message: err.message });
    res.status(500).json({ error: 'Erro ao criar sessão de pagamento. Tente novamente.' });
  }
});

// ─── POST /payments/webhook ───────────────────────────────────────────────────
// Pública — recebe notificações do Stripe
// req.body é um Buffer (express.raw configurado em index.ts antes do express.json)
router.post('/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'] as string | undefined;

  if (!signature) {
    res.status(400).json({ error: 'Missing stripe-signature header.' });
    return;
  }

  let event: StripeEvent;
  try {
    event = constructWebhookEvent(req.body as Buffer, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    logger.warn('Webhook signature verification failed', { message: err.message });
    res.status(400).json({ error: 'Webhook signature invalid.' });
    return;
  }

  res.sendStatus(200);

  try {
    await handleWebhookEvent(event);
  } catch (err: any) {
    logger.error('Webhook processing error', { message: err.message, eventType: event.type });
  }
});

async function handleWebhookEvent(event: StripeEvent): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as any;
      const userId: string | null        = session.client_reference_id ?? null;
      const subscriptionId: string | null = typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription?.id ?? null);

      if (!userId || !subscriptionId) {
        logger.warn('checkout.session.completed missing data', { sessionId: session.id });
        return;
      }

      const subscription    = await getSubscription(subscriptionId);
      const periodEnd       = subscription.items.data[0]?.current_period_end ?? 0;
      const nextBillingDate = periodEnd ? new Date(periodEnd * 1000) : null;

      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { plan: true, email: true },
      });

      await prisma.user.update({
        where: { id: userId },
        data: {
          plan: 'PRO',
          mpSubscriptionId: subscriptionId,
          mpSubscriptionStatus: 'authorized',
          mpNextBillingDate: nextBillingDate,
        },
      });

      if (currentUser?.plan !== 'PRO' && currentUser?.email) {
        await sendProWelcomeEmail(currentUser.email);
      }

      logger.info('Checkout completed — user upgraded to PRO', { userId: userId.slice(0, 8) });
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as StripeSub;
      await resolveUserAndUpdate(subscription);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as StripeSub;
      const userId = await resolveUserId(subscription);
      if (!userId) return;

      await prisma.user.update({
        where: { id: userId },
        data: {
          plan: 'FREE',
          mpSubscriptionStatus: 'cancelled',
          mpNextBillingDate: null,
        },
      });

      logger.info('Subscription deleted — user downgraded to FREE', { userId: userId.slice(0, 8) });
      break;
    }

    default:
      break;
  }
}

async function resolveUserId(subscription: StripeSub): Promise<string | null> {
  const fromMetadata = subscription.metadata?.['userId'];
  if (fromMetadata) return fromMetadata;

  const user = await prisma.user.findFirst({
    where: { mpSubscriptionId: subscription.id },
    select: { id: true },
  });

  if (!user) {
    logger.warn('Webhook: user not found for subscription', { subscriptionId: subscription.id });
    return null;
  }

  return user.id;
}

async function resolveUserAndUpdate(subscription: StripeSub): Promise<void> {
  const userId = await resolveUserId(subscription);
  if (!userId) return;

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, email: true },
  });

  const periodEnd       = subscription.items.data[0]?.current_period_end ?? 0;
  const nextBillingDate = periodEnd ? new Date(periodEnd * 1000) : null;

  let internalStatus: string;
  let newPlan: 'PRO' | 'FREE';

  if (subscription.status === 'active' && !subscription.cancel_at_period_end) {
    internalStatus = 'authorized';
    newPlan = 'PRO';
  } else if (subscription.status === 'active' && subscription.cancel_at_period_end) {
    internalStatus = 'paused';
    newPlan = 'PRO';
  } else {
    internalStatus = 'cancelled';
    newPlan = 'FREE';
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      plan: newPlan,
      mpSubscriptionId: subscription.id,
      mpSubscriptionStatus: internalStatus,
      mpNextBillingDate: nextBillingDate,
    },
  });

  if (newPlan === 'PRO' && currentUser?.plan !== 'PRO' && currentUser?.email) {
    await sendProWelcomeEmail(currentUser.email);
  }

  logger.info('Subscription updated', {
    userId: userId.slice(0, 8),
    stripeStatus: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    internalStatus,
    plan: newPlan,
  });
}

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

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { mpSubscriptionStatus: 'paused' },
    });

    logger.info('Subscription cancelled', { userId: req.user!.id.slice(0, 8) });

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
      res.status(400).json({ error: 'Assinatura não está cancelada.' });
      return;
    }

    if (!user.mpSubscriptionId) {
      res.status(400).json({ error: 'ID da assinatura não encontrado.' });
      return;
    }

    await reactivateSubscription(user.mpSubscriptionId);

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { mpSubscriptionStatus: 'authorized' },
    });

    logger.info('Subscription reactivated', { userId: req.user!.id.slice(0, 8) });

    res.json({ message: 'Assinatura reativada. A cobrança continua no próximo ciclo.' });
  } catch (err: any) {
    logger.error('Resume subscription error', { error: err.message });
    res.status(500).json({ error: 'Erro ao reativar assinatura. Tente novamente.' });
  }
});

export { router as paymentsRouter };
