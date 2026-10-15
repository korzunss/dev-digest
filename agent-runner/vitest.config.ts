import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@devdigest/shared': path.resolve(__dirname, '../server/src/vendor/shared'),
      '@devdigest/reviewer-core': path.resolve(__dirname, '../reviewer-core/src/index.ts'),
      // One copy of each, so shared + reviewer-core + the runner agree on zod.
      zod: path.resolve(__dirname, 'node_modules/zod'),
      openai: path.resolve(__dirname, 'node_modules/openai'),
    },
  },
  define: {
    __RUNNER_VERSION__: JSON.stringify('test'),
    __DEPS__: JSON.stringify({ zod: 'test' }),
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
