import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { MockGitClient } from '../../server/src/adapters/mocks.js';
import { buildIntentPrompt, classifyIntent, fileSummariesFromDiff, type IntentPromptInput } from '../src/index.js';

/**
 * The pure classifier prompt build + call (spec 006 S4). No fetch/fs/db —
 * the caller (server IntentService) resolves everything and passes it in
 * already-read; this module only builds the prompt and parses the result.
 */

const SECRET_BODY_DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "SECRET_BODY_LINE",
   redisUrl: x,`;

function baseInput(overrides: Partial<IntentPromptInput> = {}): IntentPromptInput {
  return {
    title: 'Add rate limiting',
    issues: [],
    docs: [],
    unavailable: [],
    files: [],
    ...overrides,
  };
}

describe('fileSummariesFromDiff → buildIntentPrompt — AC3: no hunk bodies ever reach the model', () => {
  it('carries the path and the numeric @@ header, but never a hunk body line', async () => {
    const diff = await new MockGitClient({ diff: SECRET_BODY_DIFF }).diff();
    const files = fileSummariesFromDiff(diff);
    const { messages } = buildIntentPrompt(baseInput({ files }));
    const user = messages[1]!.content;

    expect(user).toContain('src/config.ts');
    expect(user).toContain('@@ -10,3 +10,4 @@');
    expect(user).not.toContain('SECRET_BODY_LINE');
    expect(user).not.toContain('stripeKey');
  });
});

describe('buildIntentPrompt — optional sections', () => {
  it('omits the ## PR description section when description is empty/absent', () => {
    const { messages, sections } = buildIntentPrompt(baseInput());
    expect(messages[1]!.content).not.toContain('## PR description');
    expect(sections.find((s) => s.name === 'pr_description')).toBeUndefined();
  });

  it('includes the ## PR description section when a description is present', () => {
    const { messages, sections } = buildIntentPrompt(baseInput({ description: 'Adds a rate limiter.' }));
    expect(messages[1]!.content).toContain('## PR description');
    expect(messages[1]!.content).toContain('Adds a rate limiter.');
    expect(sections.find((s) => s.name === 'pr_description')).toBeDefined();
  });

  it('lists an unavailable source in ## Unavailable sources', () => {
    const { messages } = buildIntentPrompt(
      baseInput({ unavailable: [{ kind: 'linked_doc', ref: 'docs/plan.md', reason: 'not_found' }] }),
    );
    const user = messages[1]!.content;
    expect(user).toContain('## Unavailable sources');
    expect(user).toContain('docs/plan.md');
    expect(user).toContain('not_found');
  });
});

describe('classifyIntent — calls the provider with requireParameters: true', () => {
  it('forwards requireParameters and returns the parsed classification + usage', async () => {
    const seen: StructuredRequest<unknown>[] = [];
    const stub: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
        seen.push(req as StructuredRequest<unknown>);
        return {
          data: {
            intent: 'Add rate limiting',
            in_scope: ['limiter middleware'],
            out_of_scope: [],
            confidence: 'high',
          } as T,
          model: req.model,
          tokensIn: 42,
          tokensOut: 7,
          costUsd: 0.0004,
          costSource: 'api',
          raw: '{}',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };

    const result = await classifyIntent({ llm: stub, model: 'deepseek/deepseek-v4-flash', input: baseInput() });

    expect(seen).toHaveLength(1);
    expect(seen[0]!.requireParameters).toBe(true);
    expect(seen[0]!.schemaName).toBe('IntentClassification');
    expect(result.data.confidence).toBe('high');
    expect(result.tokensIn).toBe(42);
    expect(result.tokensOut).toBe(7);
    expect(result.costSource).toBe('api');
  });
});

describe('classifyIntent — forwards the caller-owned signal (S16b)', () => {
  it('passes the SAME AbortSignal object through to the provider request', async () => {
    const seen: StructuredRequest<unknown>[] = [];
    const stub: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
        seen.push(req as StructuredRequest<unknown>);
        return {
          data: {
            intent: 'Add rate limiting',
            in_scope: [],
            out_of_scope: [],
            confidence: 'high',
          } as T,
          model: req.model,
          tokensIn: 1,
          tokensOut: 1,
          costUsd: null,
          raw: '{}',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };
    const controller = new AbortController();

    await classifyIntent({
      llm: stub,
      model: 'deepseek/deepseek-v4-flash',
      input: baseInput(),
      signal: controller.signal,
    });

    expect(seen).toHaveLength(1);
    // The IDENTICAL object, not an equivalent one — a copy would defeat the
    // caller's ability to abort what the provider is actually awaiting on.
    expect(seen[0]!.signal).toBe(controller.signal);
  });

  it('omits `signal` entirely when the caller does not pass one', async () => {
    const seen: StructuredRequest<unknown>[] = [];
    const stub: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
        seen.push(req as StructuredRequest<unknown>);
        return {
          data: {
            intent: 'Add rate limiting',
            in_scope: [],
            out_of_scope: [],
            confidence: 'high',
          } as T,
          model: req.model,
          tokensIn: 1,
          tokensOut: 1,
          costUsd: null,
          raw: '{}',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };

    await classifyIntent({ llm: stub, model: 'deepseek/deepseek-v4-flash', input: baseInput() });

    expect(seen).toHaveLength(1);
    expect(seen[0]!.signal).toBeUndefined();
  });
});
