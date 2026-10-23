import { vi } from 'vitest';
import type { Response } from 'express';
import type { AuthRequest } from '../../src/middlewares/authMiddleware';

export function mockRequest(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return { headers: {}, body: {}, ...overrides } as AuthRequest;
}

export function mockResponse() {
  const res = {} as Response & { statusCode?: number; body?: unknown };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as any;
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res;
  }) as any;
  return res;
}
