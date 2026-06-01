import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// Rate limiting para login/registro: 10 requests por IP por 15 minutos
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGenerator, // Suporta IPv6 corretamente
});

// Rate limiting para geração de resposta: 30 requests por usuário por hora
export const replyGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 30,
  keyGenerator: (req: any) => {
    // Usar user ID se autenticado, senão IP com suporte IPv6
    return req.user?.id || ipKeyGenerator(req);
  },
  message: 'Limite de gerações atingido. Tente novamente em 1 hora.',
  standardHeaders: true,
  legacyHeaders: false,
});
