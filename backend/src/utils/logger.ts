import winston from 'winston';

const isDevelopment = process.env.NODE_ENV !== 'production';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
);

export const logger = winston.createLogger({
  level: isDevelopment ? 'debug' : 'info',
  format: logFormat,
  defaultMeta: { service: 'respondera-backend' },
  transports: [
    new winston.transports.Console({
      format: isDevelopment
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
              return `${timestamp} [${level}]: ${message} ${metaStr}`;
            }),
          )
        : logFormat,
    }),
    // Em produção, salvar logs em arquivo
    ...(isDevelopment
      ? []
      : [
          new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 10485760, // 10MB
            maxFiles: 5,
          }),
          new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 10485760,
            maxFiles: 5,
          }),
        ]),
  ],
});

/**
 * Loga tentativa de auth falhada (sem logar senha)
 */
export function logAuthFailure(email: string, reason: string): void {
  logger.warn('Authentication failure', {
    email: email.slice(0, 3) + '***', // Mascarar email
    reason,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Loga erro de geração de IA (sem logar conteúdo da avaliação)
 */
export function logReplyGenerationError(userId: string, error: string, rating?: number): void {
  logger.error('Reply generation failed', {
    userId,
    rating,
    error: error.slice(0, 200), // Limitar tamanho do erro
    timestamp: new Date().toISOString(),
  });
}

/**
 * Loga acesso de usuário (sem logar token)
 */
export function logUserAccess(userId: string, action: string): void {
  logger.info('User action', {
    userId: userId.slice(0, 8), // Mascarar ID parcialmente
    action,
    timestamp: new Date().toISOString(),
  });
}
