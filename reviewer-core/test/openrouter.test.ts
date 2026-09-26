/**
 * OpenRouterProvider.completeStructured — provider routing (spec 006 S2, D2).
 * `require_parameters: true` must reach the request body ONLY when the caller
 * asks for it (the default model's cheapest endpoints don't support
 * structured outputs, so routing must be able to exclude them) — and never
 * otherwise, since most models don't need it.
 *
 * `openai/helpers/zod` (used by `toJsonSchema`) is a different module
 * specifier from `openai` itself, so mocking the SDK's default export here
 * does not touch the real schema conversion.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const createMock = vi.fn();

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: createMock } };
    constructor(_opts: unknown) {
      void _opts;
    }
  },
}));

import { OpenRouterProvider } from '../src/llm/openrouter.js';

const TestSchema = z.object({ ok: z.boolean() });

function respondOk() {
  createMock.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  });
}

beforeEach(() => {
  createMock.mockReset();
});

describe('OpenRouterProvider.completeStructured — provider.require_parameters', () => {
  it('sends provider.require_parameters:true only when requireParameters is requested', async () => {
    respondOk();
    const provider = new OpenRouterProvider('test-key-123');

    await provider.completeStructured({
      model: 'deepseek/deepseek-v4-flash',
      schema: TestSchema,
      schemaName: 'Test',
      messages: [{ role: 'user', content: 'hi' }],
      requireParameters: true,
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const body = createMock.mock.calls[0]![0] as { provider?: { require_parameters?: boolean } };
    expect(body.provider).toEqual({ require_parameters: true });
  });

  it('omits provider.require_parameters when the flag is absent (most models)', async () => {
    respondOk();
    const provider = new OpenRouterProvider('test-key-123');

    await provider.completeStructured({
      model: 'openai/gpt-4o-mini',
      schema: TestSchema,
      schemaName: 'Test',
      messages: [{ role: 'user', content: 'hi' }],
    });

    const body = createMock.mock.calls[0]![0] as { provider?: unknown };
    expect(body.provider).toBeUndefined();
  });

  it('never sends provider.require_parameters for a non-openrouter id, even when requested', async () => {
    respondOk();
    // 'openai' id — same code path as when reviewer-core is used as a plain
    // OpenAI-compatible client outside OpenRouter.
    const provider = new OpenRouterProvider('test-key-123', { id: 'openai' });

    await provider.completeStructured({
      model: 'gpt-4o-mini',
      schema: TestSchema,
      schemaName: 'Test',
      messages: [{ role: 'user', content: 'hi' }],
      requireParameters: true,
    });

    const body = createMock.mock.calls[0]![0] as { provider?: unknown };
    expect(body.provider).toBeUndefined();
  });
});

/**
 * S16b — `completeStructured` forwards a caller-owned `AbortSignal` as the
 * 2nd argument of `chat.completions.create`, checks it before each attempt,
 * and never serialises it into the request body.
 */
describe('OpenRouterProvider.completeStructured — signal (S16b)', () => {
  it('passes { signal } as the 2nd argument to create, and the body carries no signal key', async () => {
    respondOk();
    const provider = new OpenRouterProvider('test-key-123');
    const controller = new AbortController();

    await provider.completeStructured({
      model: 'deepseek/deepseek-v4-flash',
      schema: TestSchema,
      schemaName: 'Test',
      messages: [{ role: 'user', content: 'hi' }],
      signal: controller.signal,
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0]![1]).toEqual({ signal: controller.signal });
    const body = createMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.signal).toBeUndefined();
  });

  it('a pre-aborted signal rejects WITHOUT ever calling create', async () => {
    respondOk();
    const provider = new OpenRouterProvider('test-key-123');
    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.completeStructured({
        model: 'deepseek/deepseek-v4-flash',
        schema: TestSchema,
        schemaName: 'Test',
        messages: [{ role: 'user', content: 'hi' }],
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(createMock).not.toHaveBeenCalled();
  });
});
