import './config/env';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authRouter } from './routes/auth';
import { businessRouter } from './routes/business';
import { replyRouter } from './routes/reply';
import { paymentsRouter } from './routes/payments';
import { customTonesRouter } from './routes/customTones';
import { logger } from './utils/logger';
import { env, getCorsOrigin } from './config/env';

const app = express();
const PORT = env.PORT;

// Segurança: adicionar headers HTTP
app.use(helmet());

// CORS
app.use(cors({
  origin: getCorsOrigin(),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Stripe webhook precisa do body como Buffer — deve vir antes do express.json()
app.use('/payments/webhook', express.raw({ type: 'application/json' }));

// Body parser
app.use(express.json({ limit: '10kb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rotas
app.use('/auth', authRouter);
app.use('/business', businessRouter);
app.use('/reply', replyRouter);
app.use('/payments', paymentsRouter);
app.use('/custom-tones', customTonesRouter);

// Error handler global
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack?.slice(0, 200),
  });
  
  res.status(err.status ?? 500).json({
    error: env.NODE_ENV === 'production' 
      ? 'Erro interno do servidor' 
      : err.message,
  });
});

app.listen(PORT, () => {
  logger.info(`Respondera backend running on port ${PORT}`);
});
