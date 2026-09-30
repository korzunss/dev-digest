/**
 * Typed LLM call failures. Messages carry model, numbers and schema name only —
 * never prompt or response text. Kept free of `openai` imports: transient errors
 * are classified by duck-typing.
 */

export class LlmDeadlineError extends Error {
  constructor(
    readonly model: string,
    readonly deadlineMs: number,
  ) {
    super(`LLM call to ${model} got no answer within ${Math.round(deadlineMs / 1000)} s and was aborted`);
    this.name = 'LlmDeadlineError';
  }
}

export class LlmOutputTruncatedError extends Error {
  constructor(
    readonly model: string,
    readonly maxTokens: number | undefined,
    readonly tokensOut: number,
  ) {
    super(
      `${model} hit the output cap (max_tokens=${maxTokens ?? 'unset'}) after ${tokensOut} output tokens before finishing its answer`,
    );
    this.name = 'LlmOutputTruncatedError';
  }
}

export class LlmOutputInvalidError extends Error {
  constructor(
    readonly model: string,
    readonly schemaName: string,
    readonly attempts: number,
  ) {
    super(`OpenRouter structured output failed schema validation for ${schemaName}`);
    this.name = 'LlmOutputInvalidError';
  }
}

/** True for errors worth one retry: 408/429/5xx and connection-level failures. */
export function isTransientLlmError(err: unknown): boolean {
  if (err instanceof LlmDeadlineError || err instanceof LlmOutputTruncatedError || err instanceof LlmOutputInvalidError) {
    return false;
  }
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { name?: unknown; status?: unknown; statusCode?: unknown };
  if (e.name === 'AbortError' || e.name === 'APIUserAbortError') return false;
  if (e.name === 'APIConnectionError' || e.name === 'APIConnectionTimeoutError') return true;
  for (const code of [e.status, e.statusCode]) {
    if (typeof code === 'number' && (code === 408 || code === 429 || code >= 500)) return true;
  }
  return false;
}
