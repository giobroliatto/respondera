import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { prismaMock } from './helpers/prismaMock';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock };
  },
}));

import { replyRouter } from '../src/routes/reply';

const app = express();
app.use(express.json());
app.use('/reply', replyRouter);

const business = {
  name: 'Pizzaria Dom Carlo',
  segment: 'Pizzaria',
  avgTicket: null,
  highlights: 'Forno a lenha',
  soloOperator: false,
  soloGender: null,
};

let userCounter = 0;

// Cada teste usa um usuário diferente para não esbarrar no rate limit por usuário
function setupUser(plan: 'FREE' | 'PRO', usageCount = 0) {
  const id = `user-${++userCounter}`;
  prismaMock.user.findUnique.mockResolvedValue({
    plan,
    usageCount,
    usageResetAt: new Date(),
    emailVerifiedAt: new Date(),
    tokenInvalidatedAt: null,
  });
  const token = jwt.sign({ userId: id, email: 'dono@pizzaria.com', plan }, process.env.JWT_SECRET!);
  return { id, auth: `Bearer ${token}` };
}

function lastSystemPrompt(): string {
  return createMock.mock.lastCall![0].system;
}

describe('POST /reply/generate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.business.findUnique.mockResolvedValue(business);
    createMock.mockResolvedValue({
      content: [{ type: 'text', text: 'Que bom que gostou — volte sempre!' }],
      usage: { input_tokens: 300, output_tokens: 40 },
    });
  });

  it('exige autenticação', async () => {
    const res = await request(app).post('/reply/generate').send({ rating: 5 });
    expect(res.status).toBe(401);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('gera a resposta, remove travessões e conta o uso', async () => {
    const { id, auth } = setupUser('FREE', 3);
    const res = await request(app)
      .post('/reply/generate')
      .set('Authorization', auth)
      .send({ reviewText: 'Pizza ótima', rating: 5, reviewerName: 'Lucas' });

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('Que bom que gostou, volte sempre!');
    expect(res.body.remainingUsage).toBe(6);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id },
      data: { usageCount: { increment: 1 } },
    });
  });

  it('não usa o perfil do negócio nem o contexto adicional no plano FREE', async () => {
    const { auth } = setupUser('FREE');
    const res = await request(app)
      .post('/reply/generate')
      .set('Authorization', auth)
      .send({ reviewText: 'Demorou', rating: 2, additionalContext: 'Faltou um pizzaiolo' });

    expect(res.status).toBe(200);
    expect(res.body.contextWarning).toBe('Contexto do negócio disponível apenas no plano PRO.');
    expect(lastSystemPrompt()).not.toContain('Pizzaria Dom Carlo');
    expect(lastSystemPrompt()).not.toContain('Faltou um pizzaiolo');
  });

  it('usa o perfil do negócio e o contexto adicional no plano PRO', async () => {
    const { auth } = setupUser('PRO');
    const res = await request(app)
      .post('/reply/generate')
      .set('Authorization', auth)
      .send({ reviewText: 'Demorou', rating: 2, additionalContext: 'Faltou um pizzaiolo' });

    expect(res.status).toBe(200);
    expect(res.body.contextWarning).toBeUndefined();
    expect(lastSystemPrompt()).toContain('Nome: Pizzaria Dom Carlo');
    expect(lastSystemPrompt()).toContain('"Faltou um pizzaiolo"');
  });

  it('remove HTML do texto da avaliação antes de enviar ao modelo', async () => {
    const { auth } = setupUser('FREE');
    await request(app)
      .post('/reply/generate')
      .set('Authorization', auth)
      .send({ reviewText: 'Boa <script>alert(1)</script>pizza', rating: 4 });

    const userPrompt: string = createMock.mock.lastCall![0].messages[0].content;
    expect(userPrompt).toContain('Comentário: Boa pizza');
    expect(userPrompt).not.toContain('<script>');
  });

  it('exige um rascunho no modo melhorar', async () => {
    const { auth } = setupUser('FREE');
    const res = await request(app)
      .post('/reply/generate')
      .set('Authorization', auth)
      .send({ reviewText: 'Demorou', rating: 2, mode: 'improve', draftText: '   ' });

    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('devolve 400 para dados inválidos', async () => {
    const { auth } = setupUser('FREE');
    const res = await request(app).post('/reply/generate').set('Authorization', auth).send({ rating: 9 });
    expect(res.status).toBe(400);
  });

  it('esconde o erro interno quando a API da Anthropic falha', async () => {
    const { auth } = setupUser('FREE');
    createMock.mockRejectedValue(new Error('overloaded_error: chave sk-ant-xyz'));
    const res = await request(app).post('/reply/generate').set('Authorization', auth).send({ rating: 5 });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Erro ao gerar resposta. Tente novamente.' });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
