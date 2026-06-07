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
      html: `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0D0D0D;min-height:100vh">
    <tr>
      <td align="center" style="padding:48px 16px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px">

          <!-- Logo / marca -->
          <tr>
            <td align="center" style="padding-bottom:32px">
              <span style="font-size:26px;font-weight:700;color:#FFFFFF;letter-spacing:-0.5px">
                Respond<span style="color:#10B981">era</span>
              </span>
            </td>
          </tr>

          <!-- Card principal -->
          <tr>
            <td style="background:#161616;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:40px 36px">

              <!-- Ícone -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:24px">
                    <div style="display:inline-block;background:rgba(16,185,129,0.1);border-radius:50%;width:56px;height:56px;line-height:56px;text-align:center;font-size:26px">
                      ✉
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Título -->
              <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#FFFFFF;text-align:center">
                Confirme seu e-mail
              </p>

              <!-- Subtítulo -->
              <p style="margin:0 0 32px;font-size:14px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.6">
                Para ativar sua conta na Respondera e começar a gerar respostas com IA, clique no botão abaixo.
              </p>

              <!-- Botão CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:32px">
                    <a href="${verificationUrl}"
                       style="display:inline-block;background:#10B981;color:#0D0D0D;padding:13px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:0.2px">
                      Confirmar e-mail
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px">

                    <!-- Aviso de expiração -->
                    <p style="margin:0 0 16px;font-size:13px;color:rgba(255,255,255,0.35);text-align:center">
                      Este link expira em ${VERIFICATION_EXPIRES_HOURS} horas.
                    </p>

                    <!-- Link alternativo -->
                    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);text-align:center;line-height:1.7">
                      Caso o botão não funcione, copie e cole este link no navegador:<br>
                      <span style="color:rgba(16,185,129,0.7);word-break:break-all">${verificationUrl}</span>
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
