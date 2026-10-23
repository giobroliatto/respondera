import { vi } from 'vitest';

// Substituto do Prisma Client com só os métodos usados nos fluxos testados.
// Cada teste usa vi.mock('../src/lib/prisma', ...) apontando para este objeto.
export const prismaMock = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  business: {
    findUnique: vi.fn(),
  },
};
