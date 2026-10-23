import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { prismaMock } from './helpers/prismaMock';
import { mockRequest, mockResponse } from './helpers/http';

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

import { authMiddleware } from '../src/middlewares/authMiddleware';

function tokenFor(payload: object, options: jwt.SignOptions = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET!, options);
}

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('recusa requisições sem token', async () => {
    const res = mockResponse();
    const next = vi.fn();
    await authMiddleware(mockRequest(), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('recusa token assinado com outro segredo', async () => {
    const token = jwt.sign({ userId: 'u1' }, 'outro-segredo');
    const res = mockResponse();
    const next = vi.fn();
    await authMiddleware(mockRequest({ headers: { authorization: `Bearer ${token}` } }), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('recusa token de usuário que não existe mais', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = mockResponse();
    const next = vi.fn();
    const token = tokenFor({ userId: 'u1', email: 'a@b.com', plan: 'FREE' });
    await authMiddleware(mockRequest({ headers: { authorization: `Bearer ${token}` } }), res, next);
    expect(res.statusCode).toBe(401);
  });

  it('recusa token emitido antes do último logout', async () => {
    const issuedAt = Math.floor(Date.now() / 1000) - 60;
    const token = tokenFor({ userId: 'u1', email: 'a@b.com', plan: 'FREE', iat: issuedAt });
    prismaMock.user.findUnique.mockResolvedValue({ plan: 'FREE', tokenInvalidatedAt: new Date() });

    const res = mockResponse();
    const next = vi.fn();
    await authMiddleware(mockRequest({ headers: { authorization: `Bearer ${token}` } }), res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Sessão encerrada. Faça login novamente.' });
  });

  it('usa o plano do banco, não o do token', async () => {
    const token = tokenFor({ userId: 'u1', email: 'a@b.com', plan: 'FREE' });
    prismaMock.user.findUnique.mockResolvedValue({ plan: 'PRO', tokenInvalidatedAt: null });

    const req = mockRequest({ headers: { authorization: `Bearer ${token}` } });
    const next = vi.fn();
    await authMiddleware(req, mockResponse(), next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({ id: 'u1', email: 'a@b.com', plan: 'PRO' });
  });
});
