import Stripe from 'stripe';
import { env } from '../config/env';

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

const SUCCESS_URL = 'https://respondera.com.br/pro?assinado=1';
const CANCEL_URL  = 'https://respondera.com.br/pro';

export async function createCheckoutSession(
  userId: string,
  userEmail: string,
): Promise<{ checkoutUrl: string }> {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: userEmail,
    client_reference_id: userId,
    line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
    subscription_data: {
      metadata: { userId },
    },
    success_url: SUCCESS_URL,
    cancel_url: CANCEL_URL,
  });

  return { checkoutUrl: session.url! };
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

export async function reactivateSubscription(subscriptionId: string): Promise<void> {
  await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
}

export async function getSubscription(subscriptionId: string) {
  return stripe.subscriptions.retrieve(subscriptionId);
}

export function constructWebhookEvent(
  payload: Buffer | string,
  signature: string,
  secret: string,
) {
  return stripe.webhooks.constructEvent(payload, signature, secret);
}
