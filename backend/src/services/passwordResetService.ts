import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const RESET_EXPIRES_MINUTES = 30;
const SALT_ROUNDS = 12;
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'https://respondera.com.br';

function hashToken(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function sendResetEmail(to: string, resetUrl: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    logger.info('Password reset link generated (email not configured)', {
      email: to.slice(0, 3) + '***',
      resetUrl,
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
      subject: 'Redefinir senha do Respondera',
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

          <!-- Card -->
          <tr>
            <td class="email-card" style="background:#161616;background-color:#161616;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:40px 36px">

              <!-- Ícone -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:24px">
                    <div style="display:inline-block;background:rgba(16,185,129,0.1);border-radius:50%;width:56px;height:56px;line-height:56px;text-align:center;font-size:26px">🔑</div>
                  </td>
                </tr>
              </table>

              <!-- Texto -->
              <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#F0F0F0;text-align:center">Redefinir sua senha</p>
              <p style="margin:0 0 32px;font-size:14px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.6">
                Clique no botão abaixo para criar uma nova senha.<br>O link expira em ${RESET_EXPIRES_MINUTES} minutos.
              </p>

              <!-- Botão -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:32px">
                    <a href="${resetUrl}" style="display:inline-block;background:#10B981;color:#000000;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px">
                      Redefinir senha
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px">
                    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);text-align:center;line-height:1.7">
                      Se não foi você quem solicitou, ignore este e-mail com segurança.<br>
                      Sua senha não será alterada.
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
                Se o botão não funcionar, copie e cole este link no navegador:<br>
                <span style="color:rgba(16,185,129,0.6);word-break:break-all">${resetUrl}</span>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
      text: `Redefinir senha do Respondera\n\nClique no link abaixo para criar uma nova senha (válido por ${RESET_EXPIRES_MINUTES} minutos):\n\n${resetUrl}\n\nSe não foi você, ignore este e-mail.`,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend email failed: ${response.status} ${body.slice(0, 200)}`);
  }
}

export async function createAndSendPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // não revela se o email existe

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_EXPIRES_MINUTES * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: expiresAt,
    },
  });

  const resetUrl = `${FRONTEND_URL}/resetar-senha?token=${token}`;
  await sendResetEmail(email, resetUrl);
}

export type ResetPasswordResult = 'ok' | 'invalid' | 'expired';

export async function resetPassword(token: string, newPassword: string): Promise<ResetPasswordResult> {
  const tokenHash = hashToken(token);

  const user = await prisma.user.findFirst({
    where: { passwordResetTokenHash: tokenHash },
    select: { id: true, passwordResetExpiresAt: true },
  });

  if (!user) return 'invalid';

  if (!user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() < Date.now()) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetTokenHash: null, passwordResetExpiresAt: null },
    });
    return 'expired';
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      tokenInvalidatedAt: new Date(), // invalida JWTs anteriores
    },
  });

  return 'ok';
}
