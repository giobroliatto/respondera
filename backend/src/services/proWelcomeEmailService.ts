import { env } from '../config/env';
import { logger } from '../utils/logger';

async function sendEmail(to: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    logger.info('PRO welcome email skipped (no Resend config)', { email: to.slice(0, 3) + '***' });
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
      subject: 'Você é PRO.',
      html: `<!DOCTYPE html>
<html lang="pt-BR" style="background-color:#0D0D0D">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap" rel="stylesheet">
  <style>
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
              <span style="font-family:'Bebas Neue',Arial Black,sans-serif;font-size:30px;letter-spacing:0.04em;color:#FFFFFF">
                RESPOND<span style="color:#10B981">ERA</span>
              </span>
            </td>
          </tr>

          <!-- Card principal -->
          <tr>
            <td class="email-card" style="background:#161616;background-color:#161616;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:40px 36px">

              <!-- Badge PRO -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:24px">
                    <span style="display:inline-block;background:rgba(124,58,237,0.15);border:1px solid rgba(124,58,237,0.3);color:#a78bfa;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;padding:5px 14px;border-radius:100px">
                      ✦ Plano PRO
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Título -->
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#FFFFFF;text-align:center">
                Bem-vindo ao PRO.
              </p>

              <!-- Subtítulo -->
              <p style="margin:0 0 28px;font-size:14px;color:rgba(255,255,255,0.5);text-align:center;line-height:1.7">
                A resposta já deveria estar lá.<br>Agora ela vai estar.
              </p>

              <!-- Divisor -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px">
                <tr>
                  <td style="border-top:1px solid rgba(255,255,255,0.07)"></td>
                </tr>
              </table>

              <!-- Benefícios -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px">
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:rgba(255,255,255,0.7)">
                    <span style="color:#10B981;margin-right:8px">✓</span> Respostas ilimitadas
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:rgba(255,255,255,0.7)">
                    <span style="color:#10B981;margin-right:8px">✓</span> Todos os tons disponíveis
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:rgba(255,255,255,0.7)">
                    <span style="color:#10B981;margin-right:8px">✓</span> Perfil do negócio
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;font-size:14px;color:rgba(255,255,255,0.7)">
                    <span style="color:#10B981;margin-right:8px">✓</span> Contexto adicional por avaliação
                  </td>
                </tr>
              </table>

              <!-- Divisor -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top:1px solid rgba(255,255,255,0.07);padding-top:24px">
                    <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.3);text-align:center;line-height:1.7">
                      Cobrança mensal via Stripe.<br>Cancele quando quiser, sem fidelidade.
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
                Você recebeu este e-mail porque assinou o plano PRO da Respondera.<br>
                Dúvidas? Fale com a gente em <a href="mailto:oi@respondera.com.br" style="color:rgba(16,185,129,0.6)">oi@respondera.com.br</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
      text: `Bem-vindo ao PRO, Respondera.\n\nA resposta já deveria estar lá. Agora ela vai estar.\n\nRespostas ilimitadas, todos os tons e contexto do negócio personalizado estão disponíveis agora.\n\nDúvidas? oi@respondera.com.br`,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend PRO welcome email failed: ${response.status} ${body.slice(0, 200)}`);
  }
}

export async function sendProWelcomeEmail(email: string): Promise<void> {
  try {
    await sendEmail(email);
    logger.info('PRO welcome email sent', { email: email.slice(0, 3) + '***' });
  } catch (err: any) {
    logger.error('PRO welcome email error', { message: err.message });
  }
}
