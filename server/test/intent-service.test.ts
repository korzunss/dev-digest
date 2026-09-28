import { describe, it, expect, vi } from 'vitest';
import type {
  FeatureModelChoice,
  FeatureModelId,
  IssueMeta,
  LLMProvider,
  StructuredRequest,
  StructuredResult,
  UnifiedDiff,
} from '@devdigest/shared';
import { IntentService, type IntentServiceDeps, type IntentStore } from '../src/modules/intent/service.js';
import type { IntentUpsert, PrIntentRow, RepoRow } from '../src/modules/intent/repository.js';
import type { PullRow } from '../src/db/rows.js';

/**
 * S15c + S16d — `IntentService` built from `IntentServiceDeps` fakes, with NO
 * container and NO db (D10-A makes this possible). Covers: the model/llm
 * wiring, and the budget-expiry cancellation contract (S16d) — nothing
 * fetched, computed or logged after the timeout is ever persisted.
 */

const EMPTY_DIFF: UnifiedDiff = { raw: '', files: [] };

function makePull(overrides: Partial<PullRow> = {}): PullRow {
  return {
    id: 'pr-1',
    workspaceId: 'ws-1',
    repoId: 'repo-1',
    number: 1,
    title: 'Add rate limiting',
    author: 'octocat',
    branch: 'feature',
    base: 'main',
    headSha: 'sha-1',
    lastReviewedSha: null,
    additions: 3,
    deletions: 1,
    filesCount: 1,
    status: 'needs_review',
    body: null,
    openedAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeRepo(overrides: Partial<RepoRow> = {}): RepoRow {
  return {
    id: 'repo-1',
    workspaceId: 'ws-1',
    provider: 'github',
    apiBase: null,
    owner: 'acme',
    name: 'api',
    fullName: 'acme/api',
    defaultBranch: 'main',
    clonePath: null,
    lastPolledAt: null,
    createdBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** A minimal in-memory `IntentStore` — no DB. Tracks every `upsert` call. */
function makeStore(pull: PullRow, repo: RepoRow) {
  const upserts: IntentUpsert[] = [];
  let stored: PrIntentRow | undefined;
  const store: IntentStore = {
    getPull: async () => ({ pull, repo }),
    getPrFiles: async () => [],
    upsert: async (prId, record) => {
      upserts.push(record);
      stored = {
        prId,
        intent: record.intent,
        inScope: record.inScope,
        outOfScope: record.outOfScope,
        confidence: record.confidence,
        sources: record.sources,
        missingContext: record.missingContext,
        composition: record.composition,
        headSha: record.headSha,
        descriptionHash: record.descriptionHash,
        provider: record.provider,
        model: record.model,
        tokensIn: record.tokensIn,
        tokensOut: record.tokensOut,
        costUsd: record.costUsd,
        costSource: record.costSource,
        durationMs: record.durationMs,
        classifiedAt: new Date(),
      } as PrIntentRow;
    },
    get: async () => stored,
  };
  return { store, upserts };
}

function makeGit(overrides: Partial<IntentServiceDeps['git']> = {}): IntentServiceDeps['git'] {
  return {
    diff: vi.fn(async (): Promise<UnifiedDiff> => EMPTY_DIFF),
    fetchPullHead: vi.fn(async () => undefined),
    readFileAt: vi.fn(async () => {
      throw new Error('readFileAt should not be called in this test');
    }),
    ...overrides,
  };
}

/** A provider that resolves immediately, recording the request it saw. */
function makeFastLlm(onReq?: (req: StructuredRequest<unknown>) => void): LLMProvider {
  return {
    id: 'openrouter',
    async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      onReq?.(req as StructuredRequest<unknown>);
      return {
        data: { intent: 'Add rate limiting', in_scope: [], out_of_scope: [], confidence: 'high' } as T,
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
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('IntentService — built from IntentServiceDeps fakes, no container (S15c)', () => {
  it('resolves the model via deps.resolveModel(workspaceId, "review_intent") and gets the LLM for the resolved provider', async () => {
    const pull = makePull();
    const repo = makeRepo();
    const { store } = makeStore(pull, repo);
    const resolveModel = vi.fn(
      async (_ws: string, _id: FeatureModelId): Promise<FeatureModelChoice> => ({
        provider: 'openrouter',
        model: 'deepseek/deepseek-v4-flash',
      }),
    );
    const seenProviders: FeatureModelChoice['provider'][] = [];
    const deps: IntentServiceDeps = {
      repo: store,
      git: makeGit(),
      forge: async () => ({ getIssue: async () => { throw new Error('no linked issue in this test'); } }),
      llm: async (provider) => {
        seenProviders.push(provider);
        return makeFastLlm();
      },
      tokenizer: { count: (s) => Math.ceil(s.length / 4) },
      resolveModel,
    };

    const result = await new IntentService(deps).ensureForReview('ws-1', pull, repo, EMPTY_DIFF);

    expect(result).toBeDefined();
    expect(resolveModel).toHaveBeenCalledWith('ws-1', 'review_intent');
    expect(seenProviders).toEqual(['openrouter']);
  });

  it('an LLM call that settles ONLY on abort makes ensureForReview return undefined, logging unavailable, without ever persisting', async () => {
    const pull = makePull();
    const repo = makeRepo();
    const { store, upserts } = makeStore(pull, repo);
    let sawAborted = false;
    const hangingLlm: LLMProvider = {
      id: 'openrouter',
      completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
        return new Promise((_resolve, reject) => {
          req.signal?.addEventListener('abort', () => {
            sawAborted = req.signal?.aborted ?? false;
            reject(new Error('aborted'));
          });
        });
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
    const onLog = vi.fn();
    const deps: IntentServiceDeps = {
      repo: store,
      git: makeGit(),
      forge: async () => ({ getIssue: async () => { throw new Error('no linked issue in this test'); } }),
      llm: async () => hangingLlm,
      tokenizer: { count: (s) => s.length },
      resolveModel: async () => ({ provider: 'openrouter', model: 'm' }),
      reviewBudgetMs: 50,
    };

    const result = await new IntentService(deps).ensureForReview('ws-1', pull, repo, EMPTY_DIFF, { onLog });

    expect(result).toBeUndefined();
    expect(sawAborted).toBe(true);
    expect(onLog).toHaveBeenCalledWith('intent unavailable — reviewing without it');

    // Give the still-running background classification time to (try to) finish.
    await sleep(100);
    expect(upserts).toHaveLength(0);
    expect(onLog.mock.calls.some(([msg]) => String(msg).includes('intent: classified'))).toBe(false);
  });

  it('an LLM call that IGNORES the signal and resolves after the budget still never persists (checkpoint before upsert)', async () => {
    const pull = makePull();
    const repo = makeRepo();
    const { store, upserts } = makeStore(pull, repo);
    const ignoringLlm: LLMProvider = {
      id: 'openrouter',
      completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
        return new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                data: { intent: 'x', in_scope: [], out_of_scope: [], confidence: 'high' } as T,
                model: req.model,
                tokensIn: 1,
                tokensOut: 1,
                costUsd: null,
                raw: '{}',
                attempts: 1,
              }),
            100,
          );
        });
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
    const deps: IntentServiceDeps = {
      repo: store,
      git: makeGit(),
      forge: async () => ({ getIssue: async () => { throw new Error('no linked issue in this test'); } }),
      llm: async () => ignoringLlm,
      tokenizer: { count: (s) => s.length },
      resolveModel: async () => ({ provider: 'openrouter', model: 'm' }),
      reviewBudgetMs: 50,
    };

    const result = await new IntentService(deps).ensureForReview('ws-1', pull, repo, EMPTY_DIFF);
    expect(result).toBeUndefined();

    await sleep(100);
    expect(upserts).toHaveLength(0);
  });

  it('a fast classification (well under budget) persists exactly once, with the signal never aborted', async () => {
    const pull = makePull();
    const repo = makeRepo();
    const { store, upserts } = makeStore(pull, repo);
    let seenSignal: AbortSignal | undefined;
    const deps: IntentServiceDeps = {
      repo: store,
      git: makeGit(),
      forge: async () => ({ getIssue: async () => { throw new Error('no linked issue in this test'); } }),
      llm: async () => makeFastLlm((req) => (seenSignal = req.signal)),
      tokenizer: { count: (s) => Math.ceil(s.length / 4) },
      resolveModel: async () => ({ provider: 'openrouter', model: 'm' }),
      reviewBudgetMs: 50,
    };

    const result = await new IntentService(deps).ensureForReview('ws-1', pull, repo, EMPTY_DIFF);

    expect(result).toBeDefined();
    expect(upserts).toHaveLength(1);
    expect(seenSignal?.aborted).toBe(false);
  });

  it('an issue fetch still in flight at expiry blocks the later doc read and the LLM call entirely', async () => {
    const pull = makePull({ body: 'Closes #1\n\nSee docs/plan.md for the design.' });
    const repo = makeRepo();
    const { store, upserts } = makeStore(pull, repo);
    const readFileAt = vi.fn(async () => 'doc content');
    const completeStructured = vi.fn();
    const llm: LLMProvider = {
      id: 'openrouter',
      completeStructured,
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
    const getIssue = vi.fn(
      () =>
        new Promise<IssueMeta>((resolve) => {
          setTimeout(() => resolve({ number: 1, title: 't', body: 'b', state: 'open' }), 100);
        }),
    );
    const deps: IntentServiceDeps = {
      repo: store,
      git: makeGit({ readFileAt }),
      forge: async () => ({ getIssue }),
      llm: async () => llm,
      tokenizer: { count: (s) => s.length },
      resolveModel: async () => ({ provider: 'openrouter', model: 'm' }),
      reviewBudgetMs: 50,
    };

    const result = await new IntentService(deps).ensureForReview('ws-1', pull, repo, EMPTY_DIFF);
    expect(result).toBeUndefined();

    // Let the slow, still-in-flight getIssue() settle well past the budget.
    await sleep(150);
    expect(readFileAt).not.toHaveBeenCalled();
    expect(completeStructured).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
  });

  it('manual classify() (Re-classify) passes NO signal to the LLM call', async () => {
    const pull = makePull();
    const repo = makeRepo();
    const { store, upserts } = makeStore(pull, repo);
    let seenSignal: AbortSignal | undefined | 'not-called' = 'not-called';
    const deps: IntentServiceDeps = {
      repo: store,
      git: makeGit(),
      forge: async () => ({ getIssue: async () => { throw new Error('no linked issue in this test'); } }),
      llm: async () => makeFastLlm((req) => (seenSignal = req.signal)),
      tokenizer: { count: (s) => Math.ceil(s.length / 4) },
      resolveModel: async () => ({ provider: 'openrouter', model: 'm' }),
    };

    const record = await new IntentService(deps).classify('ws-1', pull.id);

    expect(record).toBeDefined();
    expect(upserts).toHaveLength(1);
    expect(seenSignal).toBeUndefined();
  });
});
