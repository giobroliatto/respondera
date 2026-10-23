import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mesma variável que o webpack injeta via DefinePlugin
  define: {
    BACKEND_URL: JSON.stringify('http://localhost:3333'),
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
  },
});
