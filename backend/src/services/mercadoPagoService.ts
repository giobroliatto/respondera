import crypto from 'crypto';
import { env } from '../config/env';

const MP_API_BASE = 'https://api.mercadopago.com';

// Preço e descrição do plano PRO
const PRO_PLAN_PRICE = 19.90;
const PRO_PLAN_CURRENCY = 'BRL';
const PRO_PLAN_DESCRIPTION = 'Respondera PRO — respostas ilimitadas com IA';

export interface CreateSubscriptionResult {
  subscriptionId: string;
  checkoutUrl: string;
}

/**
 * Cria uma assinatura recorrente mensal no Mercado Pago.
 * Retorna o ID da assinatura e a URL de checkout para redirecionar o usuário.
 */
export async function createSubscription(
  userId: string,
  userEmail: string,
): Promise<CreateSubscriptionResult> {
  const backUrl = `${env.PUBLIC_API_URL.replace('api.', '')}/upgrade.html`;

  const body = {
    reason: PRO_PLAN_DESCRIPTION,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: PRO_PLAN_PRICE,
      currency_id: PRO_PLAN_CURRENCY,
    },
    payer_email: userEmail,
    external_reference: userId,
    back_url: backUrl,
    status: 'pending',
  };

  const response = await fetch(`${MP_API_BASE}/preapproval`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`MP createSubscription failed: ${response.status} ${errBody.slice(0, 300)}`);
  }

  const data = await response.json() as { id: string; init_point: string };

  return {
    subscriptionId: data.id,
    checkoutUrl: data.init_point,
  };
}

/**
 * Busca os detalhes de uma assinatura no MP para validar o webhook.
 */
export async function getSubscription(subscriptionId: string): Promise<{
  id: string;
  status: string;
  external_reference: string;
  payer_email: string;
}> {
  const response = await fetch(`${MP_API_BASE}/preapproval/${subscriptionId}`, {
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`MP getSubscription failed: ${response.status} ${errBody.slice(0, 300)}`);
  }

  return response.json() as Promise<{
    id: string;
    status: string;
    external_reference: string;
    payer_email: string;
  }>;
}

/**
 * Verifica a assinatura do webhook usando o secret configurado no painel do MP.
 * Retorna true se a assinatura for válida.
 */
export function verifyWebhookSignature(
  xSignature: string | undefined,
  xRequestId: string | undefined,
  dataId: string | undefined,
): boolean {
  if (!xSignature || !env.MP_WEBHOOK_SECRET) return false;

  // Formato da assinatura: "ts=<timestamp>,v1=<hash>"
  const parts = Object.fromEntries(
    xSignature.split(',').map((p) => p.split('=') as [string, string]),
  );
  const ts = parts['ts'];
  const v1 = parts['v1'];

  if (!ts || !v1) return false;

  // String assinada: "id:<dataId>;request-id:<xRequestId>;ts:<ts>;"
  const manifest = `id:${dataId ?? ''};request-id:${xRequestId ?? ''};ts:${ts};`;
  const expected = crypto
    .createHmac('sha256', env.MP_WEBHOOK_SECRET)
    .update(manifest)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}
