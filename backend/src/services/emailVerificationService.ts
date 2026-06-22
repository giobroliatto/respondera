import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const VERIFICATION_CODE_EXPIRES_MINUTES = 15;
const MAX_VERIFY_ATTEMPTS = 5;

function hashToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function generateCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

async function sendEmail(to: string, code: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    logger.info('Email verification code generated', {
      email: to.slice(0, 3) + '***',
      code,
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
      subject: 'Seu código de verificação',
      html: `<!DOCTYPE html>
<html lang="pt-BR" style="background-color:#0D0D0D">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=block');
    :root { color-scheme: dark; }
    body { background-color: #0D0D0D !important; margin: 0 !important; padding: 0 !important; }
    .email-wrapper { background-color: #0D0D0D !important; }
    .email-card { background-color: #161616 !important; }
  </style>
</head>
<body style="margin:0;padding:0;background:#0D0D0D;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table class="email-wrapper" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0D0D0D;background-color:#0D0D0D;min-height:100vh">
    <tr>
      <td align="center" style="padding:48px 16px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px">
              <span style="font-family:'Bebas Neue',Impact,sans-serif;font-size:30px;letter-spacing:0.05em;color:#FFFFFF">
                RESPOND<span style="color:#10B981">ERA</span>
              </span>
            </td>
          </tr>

          <!-- Card principal -->
          <tr>
            <td class="email-card" style="background:#161616;background-color:#161616;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:40px 36px">

              <!-- Ícone -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:24px">
                    <div style="display:inline-block;background:rgba(16,185,129,0.1);border-radius:50%;width:56px;height:56px;line-height:56px;text-align:center;font-size:26px">✉</div>
                  </td>
                </tr>
              </table>

              <!-- Subtítulo -->
              <p style="margin:0 0 28px;font-size:14px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.6">
                Use o código abaixo para confirmar seu e-mail na extensão Respondera.
              </p>

              <!-- Código em destaque -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:32px">
                    <div style="background:rgba(16,185,129,0.07);border:1px solid rgba(16,185,129,0.22);border-radius:12px;padding:28px 32px">
                      <p style="margin:0 0 10px;font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:0.12em;text-transform:uppercase;text-align:center">Código de verificação</p>
                      <p style="margin:0;font-size:42px;font-weight:700;letter-spacing:0.28em;color:#10B981;text-align:center;font-family:'Courier New',Courier,monospace">${code}</p>
                      <p style="margin:10px 0 0;font-size:11px;color:rgba(255,255,255,0.25);text-align:center">Válido por ${VERIFICATION_CODE_EXPIRES_MINUTES} minutos</p>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px">
                    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);text-align:center;line-height:1.7">
                      Abra a extensão Respondera no Chrome e insira este código.<br>
                      Se não foi você quem se cadastrou, pode ignorar este e-mail com segurança.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);line-height:1.7">
                Você recebeu este e-mail porque se cadastrou na Respondera.<br>
                Se não foi você, ignore este e-mail com segurança.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
      text: `Seu código de verificação Respondera: ${code}. Válido por ${VERIFICATION_CODE_EXPIRES_MINUTES} minutos. Abra a extensão e insira este código.`,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend email failed: ${response.status} ${body.slice(0, 200)}`);
  }
}

export async function createAndSendVerificationEmail(userId: string, email: string): Promise<void> {
  const code = generateCode();
  const codeHash = hashToken(code);
  const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRES_MINUTES * 60 * 1000);

  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerificationTokenHash: codeHash,
      emailVerificationExpiresAt: expiresAt,
      emailVerificationAttempts: 0,
    },
  });

  await sendEmail(email, code);
}

export type VerifyCodeResult =
  | { status: 'verified' }
  | { status: 'already_verified' }
  | { status: 'expired' }
  | { status: 'no_code' }
  | { status: 'too_many_attempts' }
  | { status: 'invalid'; attemptsLeft: number };

export async function verifyEmailCode(userId: string, code: string): Promise<VerifyCodeResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      emailVerifiedAt: true,
      emailVerificationTokenHash: true,
      emailVerificationExpiresAt: true,
      emailVerificationAttempts: true,
    },
  });

  if (!user) return { status: 'invalid', attemptsLeft: 0 };
  if (user.emailVerifiedAt) return { status: 'already_verified' };

  if (user.emailVerificationAttempts >= MAX_VERIFY_ATTEMPTS) {
    return { status: 'too_many_attempts' };
  }

  if (!user.emailVerificationTokenHash || !user.emailVerificationExpiresAt) {
    return { status: 'no_code' };
  }

  if (user.emailVerificationExpiresAt.getTime() < Date.now()) {
    return { status: 'expired' };
  }

  const codeHash = hashToken(code);

  if (codeHash !== user.emailVerificationTokenHash) {
    const newAttempts = user.emailVerificationAttempts + 1;
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerificationAttempts: newAttempts },
    });
    return { status: 'invalid', attemptsLeft: MAX_VERIFY_ATTEMPTS - newAttempts };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerifiedAt: new Date(),
      emailVerificationTokenHash: null,
      emailVerificationExpiresAt: null,
      emailVerificationAttempts: 0,
    },
  });

  return { status: 'verified' };
}

// Mantido para compatibilidade com links já enviados (transição de 24h)
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
      emailVerificationAttempts: 0,
    },
  });

  return 'verified';
}
