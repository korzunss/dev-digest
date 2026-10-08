import type {
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  ModelInfo,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';

/**
 * LLM stubs for tests that need a call to FAIL or to STAY PENDING, which
 * `MockLLMProvider` (always answers immediately) cannot do. Both record every
 * structured call in `calls` and keep the last request in `lastRequest`, so a
 * test can assert "exactly one call" and inspect what was sent.
 */
type ProviderId = LLMProvider['id'];

abstract class RecordingStub implements LLMProvider {
  public calls: StructuredRequest<unknown>[] = [];
  constructor(readonly id: ProviderId) {}

  get lastRequest(): StructuredRequest<unknown> | undefined {
    return this.calls[this.calls.length - 1];
  }

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }
  async complete(_req: CompletionRequest): Promise<CompletionResult> {
    throw new Error(`${this.constructor.name}: complete() is not stubbed`);
  }
  async embed(_texts: string[]): Promise<number[][]> {
    throw new Error(`${this.constructor.name}: embed() is not stubbed`);
  }
  abstract completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

/** `completeStructured` rejects with `err`. */
export class ThrowingLLMProvider extends RecordingStub {
  constructor(
    private err: unknown,
    id: ProviderId = 'openai',
  ) {
    super(id);
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push(req as StructuredRequest<unknown>);
    throw this.err;
  }
}

interface Pending {
  resolve: (r: StructuredResult<unknown>) => void;
  reject: (e: unknown) => void;
  req: StructuredRequest<unknown>;
}

/**
 * `completeStructured` returns a promise that stays pending until
 * `release(data)` (resolves every pending call with `data`) or `fail(err)`.
 * It also rejects, like a real provider, when the request's `signal` aborts.
 */
export class DeferredLLMProvider extends RecordingStub {
  private pending: Pending[] = [];

  constructor(id: ProviderId = 'openai') {
    super(id);
  }

  /** Calls that have been made and not yet released. */
  get pendingCount(): number {
    return this.pending.length;
  }

  completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push(req as StructuredRequest<unknown>);
    return new Promise<StructuredResult<T>>((resolve, reject) => {
      const entry: Pending = {
        resolve: resolve as (r: StructuredResult<unknown>) => void,
        reject,
        req: req as StructuredRequest<unknown>,
      };
      this.pending.push(entry);
      req.signal?.addEventListener('abort', () => {
        this.pending = this.pending.filter((p) => p !== entry);
        reject(req.signal?.reason ?? new Error('aborted'));
      });
    });
  }

  /** Resolve every pending call with `data` (validated by the request's own schema). */
  release(data: unknown): void {
    const batch = this.pending;
    this.pending = [];
    for (const p of batch) {
      const parsed = p.req.schema.safeParse(data);
      if (!parsed.success) {
        p.reject(new Error(`DeferredLLMProvider: data failed schema: ${parsed.error.message}`));
        continue;
      }
      p.resolve({
        data: parsed.data,
        model: p.req.model,
        tokensIn: 100,
        tokensOut: 50,
        costUsd: 0.001,
        raw: JSON.stringify(data),
        attempts: 1,
      });
    }
  }

  /** Reject every pending call with `err`. */
  fail(err: unknown): void {
    const batch = this.pending;
    this.pending = [];
    for (const p of batch) p.reject(err);
  }
}

/**
 * One stub per resolvable provider id, for `overrides.llm`. A feature resolves
 * its provider from the workspace's model setting, so a hermetic test installs
 * a stub under EVERY id (server/INSIGHTS.md 2026-09-26) and then asserts on the
 * one that was actually called.
 */
export function llmUnderEveryProvider<T extends LLMProvider>(
  make: (id: ProviderId) => T,
): Record<ProviderId, T> {
  return { openai: make('openai'), anthropic: make('anthropic'), openrouter: make('openrouter') };
}

/** Total structured calls across a set of stubs. */
export function totalCalls(stubs: Record<string, { calls: unknown[] }>): number {
  return Object.values(stubs).reduce((n, s) => n + s.calls.length, 0);
}
