import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config.js';

// Mutation testing runs only the scoring unit tests: Stryker re-runs them once per mutant.
// `mergeConfig` would APPEND `include` to the base globs (test/**/*.test.ts), so the include is
// replaced here by spreading the base config and overriding the key.
const base = baseConfig as { resolve?: object; test?: object };

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['test/eval-pipeline-scoring.test.ts'],
    exclude: ['**/node_modules/**', '**/*.it.test.ts'],
  },
});
