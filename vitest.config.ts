import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@sahu/models': p('./packages/models/src/index.ts'),
      '@sahu/shared': p('./packages/shared/src/index.ts'),
      '@sahu/api': p('./packages/api/src/index.ts'),
    },
  },
  test: { include: ['packages/**/test/**/*.test.ts'], environment: 'node' },
});
