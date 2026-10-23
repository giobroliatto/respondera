import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Valores fictícios: config/env.ts exige essas variáveis ao ser importado
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'segredo-de-teste',
      ANTHROPIC_API_KEY: 'sk-ant-teste',
    },
  },
});
