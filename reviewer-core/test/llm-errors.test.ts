import { describe, it, expect } from 'vitest';
import {
  isTransientLlmError,
  LlmConnectionError,
  LlmDeadlineError,
  LlmOutputTruncatedError,
  LlmOutputInvalidError,
} from '../src/llm/errors.js';

describe('isTransientLlmError', () => {
  it('is true for 429 and 503', () => {
    expect(isTransientLlmError({ status: 429 })).toBe(true);
    expect(isTransientLlmError({ statusCode: 503 })).toBe(true);
  });
  it('is false for 400', () => {
    expect(isTransientLlmError({ status: 400 })).toBe(false);
  });
  it('is true for LlmConnectionError', () => {
    expect(isTransientLlmError(new LlmConnectionError('m', false))).toBe(true);
    expect(isTransientLlmError(new LlmConnectionError('m', true))).toBe(true);
  });
  it('is false for aborts', () => {
    expect(isTransientLlmError({ name: 'AbortError' })).toBe(false);
  });
  it('is false for the typed classes', () => {
    expect(isTransientLlmError(new LlmDeadlineError('m', 1000))).toBe(false);
    expect(isTransientLlmError(new LlmOutputTruncatedError('m', 10, 10))).toBe(false);
    expect(isTransientLlmError(new LlmOutputInvalidError('m', 's', 3))).toBe(false);
  });
  it('messages name model and numbers', () => {
    expect(new LlmDeadlineError('m', 600_000).message).toContain('600 s');
    const t = new LlmOutputTruncatedError('m', 32000, 31999);
    expect(t.message).toContain('max_tokens=32000');
    expect(t.message).toContain('31999');
    expect(t.name).toBe('LlmOutputTruncatedError');
  });
});
