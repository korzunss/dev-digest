import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig, type AppConfig } from '../../src/platform/config.js';

/**
 * An `AppConfig` isolated from the developer's real `~/.devdigest/secrets.json`
 * (spec 006 Fix R1 / Option B).
 *
 * Every `.it.test.ts` that drives `POST /pulls/:id/review` now also triggers
 * `IntentService.ensureForReview` (run-executor.ts), which resolves an LLM
 * provider (and, for a PR body with an issue reference, a forge client) through
 * `container.secrets` unless the test injects one via `overrides`. Reusing
 * `loadConfig()`'s default `secretsPath` means a real OpenRouter/forge key
 * configured on the developer's machine turns a hermetic test into a live
 * network call — bounded by `INTENT_REVIEW_BUDGET_MS` (20s), which races
 * `waitForPrRuns`'s / `readTrace`'s default 10s wait and fails intermittently
 * with "trace … never appeared" (server/INSIGHTS.md 2026-09-21).
 *
 * Pointing `secretsPath` at a file that doesn't exist makes `LocalSecretsProvider`
 * fall through to `process.env` (still unset unless the shell itself exports a
 * key) — `container.llm(...)`/`container.forge(...)` then reject with
 * `ConfigError` almost immediately, so `ensureForReview` resolves "intent
 * unavailable" well inside every existing wait, and the review proceeds exactly
 * as spec 006 AC12 requires. A test that DOES want to exercise the classifier
 * should inject a `MockLLMProvider` via `overrides.llm.openrouter` instead of
 * relying on a real key.
 */
export function isolatedTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const base = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
  const secretsPath = path.join(
    tmpdir(),
    `devdigest-test-secrets-${process.pid}-${Math.random().toString(36).slice(2)}.json`,
  );
  return { ...base, secretsPath, ...overrides };
}
