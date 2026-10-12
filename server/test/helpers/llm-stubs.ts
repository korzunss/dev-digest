import type {
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  ModelInfo,
  Review,
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

/** One scripted answer: used when `match` occurs in the request's system prompt. */
export interface LlmScript {
  match: string;
  /** A fixed review, or one computed from the request (e.g. by the file in the diff). */
  review: Review | ((req: StructuredRequest<unknown>) => Review);
}

/**
 * `completeStructured` answers with the `Review` of the FIRST script whose
 * `match` is a substring of the system prompt, so one provider can play an
 * "old prompt" and a "new prompt" agent in the same test. No script matched:
 * it rejects, which a case runner reports as an errored case.
 */
export class ScriptedLLMProvider extends RecordingStub {
  constructor(
    private scripts: LlmScript[],
    id: ProviderId = 'openai',
  ) {
    super(id);
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const unknownReq = req as StructuredRequest<unknown>;
    this.calls.push(unknownReq);
    const system = req.messages
      .filter((m) => m.role === 'system')
      .map((m) => String(m.content))
      .join('\n');
    const script = this.scripts.find((s) => system.includes(s.match));
    if (!script) throw new Error('ScriptedLLMProvider: no script matches the system prompt');
    const data = typeof script.review === 'function' ? script.review(unknownReq) : script.review;
    const parsed = req.schema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`ScriptedLLMProvider: review failed schema: ${parsed.error.message}`);
    }
    return {
      data: parsed.data,
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
      raw: JSON.stringify(data),
      attempts: 1,
    };
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
