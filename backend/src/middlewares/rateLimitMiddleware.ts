import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

function requestIpKey(req: any): string {
  return ipKeyGenerator(req.ip ?? req.socket?.remoteAddress ?? 'unknown');
}

// Rate limiting para login/registro: 10 requests por IP por 15 minutos
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    error: 'RATE_LIMITED',
    message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: requestIpKey,
});

// Rate limiting para geracao de resposta: 30 requests por usuario por hora
export const replyGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: (req: any) => req.user?.id || requestIpKey(req),
  message: {
    error: 'RATE_LIMITED',
    message: 'Limite de geracoes atingido. Tente novamente em 1 hora.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting para reenvio de confirmacao: 3 requests por usuario/IP por hora
export const emailVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req: any) => req.user?.id || requestIpKey(req),
  message: {
    error: 'RATE_LIMITED',
    message: 'Muitas tentativas de reenvio. Tente novamente em 1 hora.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
