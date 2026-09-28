/**
 * S16c — the server's OpenAI/Anthropic adapters forward a caller-owned
 * `AbortSignal` to the SDK call, never into the request body, and an abort
 * must not be retried by `withRetry` (D12-B). Same SDK-mocking idiom as
 * `reviewer-core/test/openrouter.test.ts`: the SDK's own module is mocked so
 * `toJsonSchema`/`parseWithRepair` and the real class shape stay untouched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const openaiCreateMock = vi.fn();
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: openaiCreateMock } };
    constructor(_opts: unknown) {
      void _opts;
    }
  },
}));

const anthropicCreateMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: anthropicCreateMock };
    constructor(_opts: unknown) {
      void _opts;
    }
  },
}));

import { OpenAIProvider } from '../src/adapters/llm/openai.js';
import { AnthropicProvider } from '../src/adapters/llm/anthropic.js';

const TestSchema = z.object({ ok: z.boolean() });

function openaiOk() {
  openaiCreateMock.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  });
}

function anthropicOk() {
  anthropicCreateMock.mockResolvedValue({
    content: [{ type: 'tool_use', input: { ok: true } }],
    usage: { input_tokens: 1, output_tokens: 1 },
  });
}

/** No `status`/`code` — exactly what `openai`/`@anthropic-ai/sdk`'s
 * `APIUserAbortError` looks like, so `defaultIsRetryable` classifies it as
 * NOT retryable (`platform/resilience.ts`'s status/code checks both miss). */
function abortError(): Error {
  return Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError' });
}

beforeEach(() => {
  openaiCreateMock.mockReset();
  anthropicCreateMock.mockReset();
});

describe('OpenAIProvider.completeStructured — signal (S16c)', () => {
  it('passes { signal } as the 2nd argument to chat.completions.create, never inside the body', async () => {
    openaiOk();
    const controller = new AbortController();
    const provider = new OpenAIProvider('test-key-123');

    await provider.completeStructured({
      model: 'gpt-4o-mini',
      schema: TestSchema,
      schemaName: 'Test',
      messages: [{ role: 'user', content: 'hi' }],
      signal: controller.signal,
    });

    expect(openaiCreateMock).toHaveBeenCalledTimes(1);
    expect(openaiCreateMock.mock.calls[0]![1]).toEqual({ signal: controller.signal });
    const body = openaiCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.signal).toBeUndefined();
  });

  it('rejects without ever calling create when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = new OpenAIProvider('test-key-123');

    await expect(
      provider.completeStructured({
        model: 'gpt-4o-mini',
        schema: TestSchema,
        schemaName: 'Test',
        messages: [{ role: 'user', content: 'hi' }],
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(openaiCreateMock).not.toHaveBeenCalled();
  });

  it('an abort mid-call is not retried — create is called exactly once', async () => {
    openaiCreateMock.mockRejectedValue(abortError());
    const controller = new AbortController();
    const provider = new OpenAIProvider('test-key-123');

    await expect(
      provider.completeStructured({
        model: 'gpt-4o-mini',
        schema: TestSchema,
        schemaName: 'Test',
        messages: [{ role: 'user', content: 'hi' }],
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(openaiCreateMock).toHaveBeenCalledTimes(1);
  });
});

describe('AnthropicProvider.completeStructured — signal (S16c)', () => {
  it('passes { signal } as the 2nd argument to messages.create, never inside the body', async () => {
    anthropicOk();
    const controller = new AbortController();
    const provider = new AnthropicProvider('test-key-123');

    await provider.completeStructured({
      model: 'claude-3-5-sonnet',
      schema: TestSchema,
      schemaName: 'Test',
      messages: [{ role: 'user', content: 'hi' }],
      signal: controller.signal,
    });

    expect(anthropicCreateMock).toHaveBeenCalledTimes(1);
    expect(anthropicCreateMock.mock.calls[0]![1]).toEqual({ signal: controller.signal });
    const body = anthropicCreateMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.signal).toBeUndefined();
  });

  it('rejects without ever calling create when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = new AnthropicProvider('test-key-123');

    await expect(
      provider.completeStructured({
        model: 'claude-3-5-sonnet',
        schema: TestSchema,
        schemaName: 'Test',
        messages: [{ role: 'user', content: 'hi' }],
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });

  it('an abort mid-call is not retried — create is called exactly once', async () => {
    anthropicCreateMock.mockRejectedValue(abortError());
    const controller = new AbortController();
    const provider = new AnthropicProvider('test-key-123');

    await expect(
      provider.completeStructured({
        model: 'claude-3-5-sonnet',
        schema: TestSchema,
        schemaName: 'Test',
        messages: [{ role: 'user', content: 'hi' }],
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(anthropicCreateMock).toHaveBeenCalledTimes(1);
  });
});
