import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const VERIFICATION_TOKEN_BYTES = 32;
const VERIFICATION_EXPIRES_HOURS = 24;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildVerificationUrl(token: string): string {
  const baseUrl = env.PUBLIC_API_URL.replace(/\/$/, '');
  return `${baseUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
}

async function sendEmail(to: string, verificationUrl: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    logger.info('Email verification link generated', {
      email: to.slice(0, 3) + '***',
      verificationUrl,
    });
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to,
      subject: 'Confirme seu e-mail na Respondera',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
          <h1 style="font-size:20px">Confirme seu e-mail</h1>
          <p>Para liberar a geração de respostas na Respondera, confirme este e-mail.</p>
          <p>
            <a href="${verificationUrl}" style="display:inline-block;background:#10B981;color:#0D0D0D;padding:10px 14px;border-radius:6px;text-decoration:none;font-weight:700">
              Confirmar e-mail
            </a>
          </p>
          <p>Este link expira em ${VERIFICATION_EXPIRES_HOURS} horas.</p>
        </div>
      `,
      text: `Confirme seu e-mail na Respondera: ${verificationUrl}`,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend email failed: ${response.status} ${body.slice(0, 200)}`);
  }
}

export async function createAndSendVerificationEmail(userId: string, email: string): Promise<void> {
  const token = crypto.randomBytes(VERIFICATION_TOKEN_BYTES).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + VERIFICATION_EXPIRES_HOURS * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpiresAt: expiresAt,
    },
  });

  await sendEmail(email, buildVerificationUrl(token));
}

export async function verifyEmailToken(token: string): Promise<'verified' | 'expired' | 'invalid'> {
  const tokenHash = hashToken(token);
  const user = await prisma.user.findFirst({
    where: { emailVerificationTokenHash: tokenHash },
    select: { id: true, emailVerificationExpiresAt: true },
  });

  if (!user) return 'invalid';

  if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt.getTime() < Date.now()) {
    return 'expired';
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: new Date(),
      emailVerificationTokenHash: null,
      emailVerificationExpiresAt: null,
    },
  });

  return 'verified';
}
