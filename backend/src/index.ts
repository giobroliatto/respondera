import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authRouter } from './routes/auth';
import { businessRouter } from './routes/business';
import { replyRouter } from './routes/reply';
import { logger } from './utils/logger';

const app = express();
const PORT = process.env.PORT ?? 3333;

// Segurança: adicionar headers HTTP
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN ?? '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parser
app.use(express.json({ limit: '10kb' })); // Limitar tamanho do payload

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rotas
app.use('/auth', authRouter);
app.use('/business', businessRouter);
app.use('/reply', replyRouter);

// Error handler global
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack?.slice(0, 200),
  });
  
  res.status(err.status ?? 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Erro interno do servidor' 
      : err.message,
  });
});

app.listen(PORT, () => {
  logger.info(`Respondera backend running on port ${PORT}`);
});
