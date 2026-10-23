import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock } from './helpers/prismaMock';
import { mockRequest, mockResponse } from './helpers/http';

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

import { usageLimitMiddleware } from '../src/middlewares/usageLimitMiddleware';

const NOW = new Date('2026-06-20T12:00:00Z');

function user(overrides: object = {}) {
  return {
    plan: 'FREE',
    usageCount: 0,
    usageResetAt: new Date('2026-06-01T12:00:00Z'),
    emailVerifiedAt: new Date('2026-06-01T12:00:00Z'),
    ...overrides,
  };
}

async function run(body: object = {}) {
  const req = mockRequest({ user: { id: 'u1', email: 'a@b.com', plan: 'FREE' }, body });
  const res = mockResponse();
  const next = vi.fn();
  await usageLimitMiddleware(req, res, next);
  return { req, res, next };
}

describe('usageLimitMiddleware', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('bloqueia quem ainda não confirmou o e-mail', async () => {
    prismaMock.user.findUnique.mockResolvedValue(user({ emailVerifiedAt: null }));
    const { res, next } = await run();
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: 'EMAIL_NOT_VERIFIED' });
    expect(next).not.toHaveBeenCalled();
  });

  it.each(['direct', 'casual', 'assertive', 'custom'])('bloqueia o tom PRO "%s" no plano FREE', async (tone) => {
    prismaMock.user.findUnique.mockResolvedValue(user());
    const { res } = await run({ tone });
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: 'PRO_REQUIRED' });
  });

  it('libera os tons PRO para assinantes', async () => {
    prismaMock.user.findUnique.mockResolvedValue(user({ plan: 'PRO' }));
    const { next } = await run({ tone: 'assertive' });
    expect(next).toHaveBeenCalledOnce();
  });

  it('bloqueia o plano FREE depois de 10 respostas no mês', async () => {
    prismaMock.user.findUnique.mockResolvedValue(user({ usageCount: 10 }));
    const { res } = await run();
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ error: 'USAGE_LIMIT_REACHED' });
  });

  it('zera o contador quando vira o mês', async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      user({ usageCount: 10, usageResetAt: new Date('2026-05-15T12:00:00Z') }),
    );
    const { req, next } = await run();

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { usageCount: 0, usageResetAt: NOW },
    });
    expect(next).toHaveBeenCalledOnce();
    expect(req.usageInfo).toEqual({ count: 0, limit: 10 });
  });

  it('zera o contador na virada do ano', async () => {
    vi.setSystemTime(new Date('2027-01-05T12:00:00Z'));
    prismaMock.user.findUnique.mockResolvedValue(
      user({ usageCount: 10, usageResetAt: new Date('2026-12-20T12:00:00Z') }),
    );
    const { next } = await run();
    expect(next).toHaveBeenCalledOnce();
  });

  it('deixa passar e informa o uso atual', async () => {
    prismaMock.user.findUnique.mockResolvedValue(user({ usageCount: 3 }));
    const { req, next } = await run({ tone: 'friendly' });
    expect(next).toHaveBeenCalledOnce();
    expect(req.usageInfo).toEqual({ count: 3, limit: 10 });
  });
});
