import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Unit tests for pure billing/quota/plan logic. Playwright specs live in
 * tests/*.spec.ts and run via `pnpm exec playwright test` — they are NOT part
 * of this suite.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    env: {
      // Prisma client constructs lazily; a dummy URL keeps import-time happy.
      DATABASE_URL: 'postgresql://localhost:5432/test',
    },
  },
});
