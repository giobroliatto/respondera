import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth';
import { businessRouter } from './routes/business';
import { replyRouter } from './routes/reply';

const app = express();
const PORT = process.env.PORT ?? 3333;

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rotas
app.use('/auth', authRouter);
app.use('/business', businessRouter);
app.use('/reply', replyRouter);

app.listen(PORT, () => {
  console.log(`Respondera backend running on port ${PORT}`);
});

export default app;
