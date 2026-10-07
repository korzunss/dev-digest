import { describe, it, expect, vi } from 'vitest';
import type {
  BlastRadius,
  LLMProvider,
  PrBrief,
  PrBriefModelOutput,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { BriefService, type BriefServiceDeps } from '../src/modules/brief/service.js';
import { BRIEF_LLM_TIMEOUT_MS } from '../src/modules/brief/constants.js';
import { ConfigError } from '../src/platform/errors.js';
import type { PullRow } from '../src/db/rows.js';
import type { BriefRepoRow } from '../src/modules/brief/types.js';

/**
 * T6 — `BriefService` over fakes: no container, no DB. Covers the guard, the
 * one-call contract, the failure classes and the `missing_inputs` entries.
 */

const PATCH = '@@ -1,2 +10,3 @@\n a\n+b\n c';

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
    baseSha: null,
    lastReviewedSha: null,
    filesHeadSha: null,
    additions: 3,
    deletions: 1,
    filesCount: 1,
    status: 'needs_review',
    body: 'Fixes the thing',
    openedAt: null,
    updatedAt: null,
    ...overrides,
  } as PullRow;
}

const REPO = { owner: 'acme', name: 'app', contextGlobs: [] } as unknown as BriefRepoRow;

const OUTPUT: PrBriefModelOutput = {
  summary: 'S',
  risks: [{ kind: 'k', title: 'T', explanation: 'E', severity: 'high', file_refs: ['src/a.ts', 'invented.ts'] }],
  review_focus: [
    { file: 'src/a.ts', line: 11, reason: 'in hunk' },
    { file: 'src/a.ts', line: 500, reason: 'outside' },
  ],
};

function makeLlm(opts: { fail?: Error; gate?: Promise<void> } = {}) {
  const calls: StructuredRequest<unknown>[] = [];
  const llm: LLMProvider = {
    id: 'openrouter',
    async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      calls.push(req as StructuredRequest<unknown>);
      if (opts.gate) await opts.gate;
      if (opts.fail) throw opts.fail;
      return {
        data: OUTPUT as unknown as T,
        model: req.model,
        tokensIn: 120,
        tokensOut: 40,
        costUsd: 0.002,
        raw: '',
        attempts: 1,
      };
    },
    async listModels() {
      return [];
    },
    async complete() {
      throw new Error('unused');
    },
    async embed() {
      return [];
    },
  };
  return { llm, calls };
}

function blast(over: Partial<BlastRadius> = {}): BlastRadius {
  return {
    changed_symbols: [{ name: 'f', file: 'src/a.ts', kind: 'function', rank: 1 }],
    downstream: [],
    summary: '',
    degraded: false,
    reason: null,
    limits: { callers_per_symbol: 5, depth: 2 },
    ...over,
  };
}

function build(over: Partial<BriefServiceDeps> = {}, pull = makePull()) {
  let stored: unknown;
  const upserts: unknown[] = [];
  const { llm, calls } = makeLlm();
  const deps: BriefServiceDeps = {
    repo: {
      getPull: async () => ({ pull, repo: REPO }),
      getPrFiles: async () => [{ path: 'src/a.ts', additions: 2, deletions: 0, patch: PATCH }],
      latestReview: async () => ({ verdict: null, score: null, findings: [] }),
      getBrief: async () => stored,
      upsertBrief: async (_id, json) => {
        stored = json;
        upserts.push(json);
      },
    },
    intent: {
      get: async () => ({
        pr_head_sha: 'sha-1',
        intent: {
          intent: 'i',
          in_scope: [],
          out_of_scope: [],
          confidence: 'high',
          stale: false,
          stale_reason: null,
        } as never,
      }),
      readLinkedIssues: async () => ({ issues: [], failed: [] }),
    },
    blast: { getBlast: async () => blast() },
    smartDiff: { get: async () => ({ groups: [], split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] } }) },
    agents: {
      listEnabled: async () => [{ id: 'a1' }],
      listContextDocs: async () => [{ path: 'specs/x.md' }],
      inheritedContextDocs: async () => [],
    },
    context: { readDocsForRun: async () => ({ docs: [{ path: 'specs/x.md', body: 'doc' }], skipped: [] }) },
    llm: async () => llm,
    tokenizer: { count: (s) => Math.ceil(s.length / 4) },
    resolveModel: async () => ({ provider: 'openrouter', model: 'm-1' }),
    ...over,
  };
  const log = { info: vi.fn(), warn: vi.fn() };
  return { svc: new BriefService(deps), deps, calls, log, upserts, llm };
}

const missingOf = (view: { brief: PrBrief | null } | undefined) => view?.brief?.missing_inputs ?? [];

describe('BriefService.generate (T6)', () => {
  it('makes one call with maxRetries 0, the risk_brief model, an explicit timeout and a signal', async () => {
    const t = build();
    const view = await t.svc.generate('ws-1', 'pr-1', t.log);
    expect(t.calls).toHaveLength(1);
    const req = t.calls[0]!;
    expect(req.maxRetries).toBe(0);
    expect(req.model).toBe('m-1');
    expect(req.timeoutMs).toBe(BRIEF_LLM_TIMEOUT_MS);
    expect(req.signal).toBeInstanceOf(AbortSignal);
    expect(view?.failure).toBeNull();
    expect(view?.brief?.head_sha).toBe('sha-1');
    expect(view?.brief?.model).toEqual({ provider: 'openrouter', model: 'm-1' });
  });

  it('grounds the output: invented file and out-of-hunk line are dropped', async () => {
    const t = build();
    const view = await t.svc.generate('ws-1', 'pr-1', t.log);
    expect(view?.brief?.risks.risks[0]?.file_refs).toEqual(['src/a.ts']);
    expect(view?.brief?.review_focus.map((f) => f.line)).toEqual([11]);
  });

  it('two concurrent generates make one call; the second sees in_progress', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { llm, calls } = makeLlm({ gate });
    const t = build({ llm: async () => llm });
    const a = t.svc.generate('ws-1', 'pr-1', t.log);
    const b = await t.svc.generate('ws-1', 'pr-1', t.log);
    expect(b?.failure).toBe('in_progress');
    expect(b?.generating).toBe(true);
    release();
    const first = await a;
    expect(calls).toHaveLength(1);
    expect(first?.generating).toBe(false);
  });

  it('a ConfigError resolving the llm gives no_key, no call, no upsert, nothing else read', async () => {
    const getPrFiles = vi.fn(async () => []);
    const t = build({
      llm: async () => {
        throw new ConfigError('OPENROUTER_API_KEY is not configured');
      },
    });
    t.deps.repo.getPrFiles = getPrFiles;
    const view = await t.svc.generate('ws-1', 'pr-1', t.log);
    expect(view?.failure).toBe('no_key');
    expect(t.calls).toHaveLength(0);
    expect(t.upserts).toHaveLength(0);
    expect(getPrFiles).not.toHaveBeenCalled();
  });

  it('a throwing call is failed: no upsert, one content-free warn line', async () => {
    const { llm } = makeLlm({ fail: new Error('secret body text') });
    const t = build({ llm: async () => llm });
    const view = await t.svc.generate('ws-1', 'pr-1', t.log);
    expect(view?.failure).toBe('failed');
    expect(t.upserts).toHaveLength(0);
    expect(t.log.warn).toHaveBeenCalledTimes(1);
    expect(t.log.warn.mock.calls[0]![0]).toMatch(/^brief: failed reason=\w+ err=\w+$/);
    expect(String(t.log.warn.mock.calls[0]![0])).not.toContain('secret');
  });

  it('an untrimmable input is over_budget with no model call', async () => {
    const t = build({ tokenizer: { count: () => 100_000 } });
    const view = await t.svc.generate('ws-1', 'pr-1', t.log);
    expect(view?.failure).toBe('over_budget');
    expect(t.calls).toHaveLength(0);
    expect(t.upserts).toHaveLength(0);
  });

  it('logs exactly one info line with provider/model, tokens, cost and duration', async () => {
    const t = build();
    await t.svc.generate('ws-1', 'pr-1', t.log);
    const lines = t.log.info.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('brief:'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^brief: \S+\/\S+ tokens \d+\/\d+ cost \S+ duration_ms \d+$/);
  });

  it('records each missing input (AC-14..21)', async () => {
    const t = build({
      intent: {
        get: async () => ({ pr_head_sha: 'sha-1', intent: null }),
        readLinkedIssues: async () => ({ issues: [], failed: [{ ref: 'acme/app#12', reason: 'not_found' }] }),
      },
      blast: { getBlast: async () => blast({ degraded: true, reason: 'no_data' }) },
      repo: {
        getPull: async () => ({ pull: makePull(), repo: REPO }),
        getPrFiles: async () => [{ path: 'src/a.ts', additions: 2, deletions: 0, patch: PATCH }],
        latestReview: async () => undefined,
        getBrief: async () => undefined,
        upsertBrief: async () => undefined,
      },
      agents: { listEnabled: async () => [], listContextDocs: async () => [], inheritedContextDocs: async () => [] },
    });
    let saved: unknown;
    t.deps.repo.upsertBrief = async (_id, json) => {
      saved = json;
    };
    await t.svc.generate('ws-1', 'pr-1', t.log);
    const m = (saved as PrBrief).missing_inputs;
    expect(m).toContainEqual({ input: 'intent', status: 'missing', ref: null, reason: null });
    expect(m).toContainEqual({ input: 'blast_radius', status: 'partial', ref: null, reason: 'no_data' });
    expect(m).toContainEqual({ input: 'review_findings', status: 'missing', ref: null, reason: null });
    expect(m).toContainEqual({ input: 'linked_issue', status: 'missing', ref: 'acme/app#12', reason: 'not_found' });
    expect(m).toContainEqual({ input: 'attached_specs', status: 'missing', ref: null, reason: null });
  });

  it('stores the call usage with the brief; a null cost stays null (AC-49)', async () => {
    const t = build();
    await t.svc.generate('ws-1', 'pr-1', t.log);
    expect((t.upserts[0] as PrBrief).usage).toEqual({ tokens_in: 120, tokens_out: 40, cost_usd: 0.002, cost_source: null });
    const t2 = build();
    const llm2 = t2.llm;
    llm2.completeStructured = async <T,>(req: StructuredRequest<T>): Promise<StructuredResult<T>> => ({
      data: OUTPUT as unknown as T, model: req.model, tokensIn: 5, tokensOut: 6, costUsd: null, raw: '', attempts: 1,
    });
    await t2.svc.generate('ws-1', 'pr-1', t2.log);
    expect((t2.upserts[0] as PrBrief).usage).toMatchObject({ cost_usd: null, tokens_in: 5 });
  });

  it('records blast_radius missing when getBlast returns undefined or throws (AC-18)', async () => {
    for (const getBlast of [async () => undefined, async () => { throw new Error('boom'); }]) {
      const t = build({ blast: { getBlast } as unknown as BriefServiceDeps['blast'] });
      const view = await t.svc.generate('ws-1', 'pr-1', t.log);
      expect(missingOf(view)).toContainEqual({ input: 'blast_radius', status: 'missing', ref: null, reason: null });
    }
  });

  it('records linked_issue missing when reading the linked issues throws (AC-21)', async () => {
    const t = build({
      intent: {
        ...build().deps.intent,
        readLinkedIssues: async () => {
          throw new Error('boom');
        },
      },
    });
    const view = await t.svc.generate('ws-1', 'pr-1', t.log);
    expect(view?.failure).toBeNull();
    expect(missingOf(view)).toContainEqual({ input: 'linked_issue', status: 'missing', ref: null, reason: null });
  });

  it('a stale intent is recorded stale and a skipped doc is recorded with its path', async () => {
    const t = build({
      intent: {
        get: async () => ({
          pr_head_sha: 'sha-1',
          intent: { intent: 'i', in_scope: [], out_of_scope: [], confidence: 'low', stale: true, stale_reason: 'head_moved' } as never,
        }),
        readLinkedIssues: async () => ({ issues: [], failed: [] }),
      },
      context: { readDocsForRun: async () => ({ docs: [], skipped: [{ path: 'specs/x.md', reason: 'missing' }] }) },
    });
    const view = await t.svc.generate('ws-1', 'pr-1', t.log);
    expect(missingOf(view)).toContainEqual({ input: 'intent', status: 'stale', ref: null, reason: 'head_moved' });
    expect(missingOf(view)).toContainEqual({ input: 'attached_specs', status: 'missing', ref: 'specs/x.md', reason: 'missing' });
  });

  it('a capped blast is recorded as truncated blast_radius (AC-44)', async () => {
    const many = Array.from({ length: 45 }, (_, i) => ({ name: `s${i}`, file: 'src/a.ts', kind: 'function', rank: 1 }));
    const t = build({ blast: { getBlast: async () => blast({ changed_symbols: many }) } });
    const view = await t.svc.generate('ws-1', 'pr-1', t.log);
    expect(missingOf(view)).toContainEqual({ input: 'blast_radius', status: 'truncated', ref: null, reason: null });
  });

  it('a failed generation leaves the stored brief untouched and reports failure', async () => {
    const t = build();
    await t.svc.generate('ws-1', 'pr-1', t.log);
    const before = t.upserts.length;
    const { llm } = makeLlm({ fail: new Error('x') });
    t.deps.llm = async () => llm;
    const view = await new BriefService(t.deps).generate('ws-1', 'pr-1', t.log);
    expect(t.upserts).toHaveLength(before);
    expect(view?.failure).toBe('failed');
    expect(view?.brief).not.toBeNull();
  });
});

describe('BriefService.generate — boundaries', () => {
  // the prompt carries file paths and finding titles but never a hunk body or a finding rationale
  it('sends no patch body and no finding rationale to the model', async () => {
    const t = build({
      repo: {
        getPull: async () => ({ pull: makePull(), repo: REPO }),
        getPrFiles: async () => [
          { path: 'src/a.ts', additions: 1, deletions: 0, patch: '@@ -1,2 +10,3 @@\n+SECRET_PATCH_BODY' },
        ],
        latestReview: async () => ({
          verdict: null,
          score: null,
          findings: [
            { file: 'src/a.ts', startLine: 11, severity: 'high', title: 'LIVE_TITLE', rationale: 'SECRET_RATIONALE' },
          ],
        }),
        getBrief: async () => undefined,
        upsertBrief: async () => undefined,
      } as unknown as BriefServiceDeps['repo'],
    });
    await t.svc.generate('ws-1', 'pr-1', t.log);
    const sent = JSON.stringify(t.calls[0]!.messages);
    expect(sent).toContain('src/a.ts');
    expect(sent).toContain('LIVE_TITLE');
    expect(sent).not.toContain('SECRET_PATCH_BODY');
    expect(sent).not.toContain('SECRET_RATIONALE');
  });

  // a model that invents paths, traversals and out-of-hunk lines gets none of them stored
  it('stores nothing the model invented, whatever the path spelling', async () => {
    const { llm } = makeLlm();
    const evil: PrBriefModelOutput = {
      summary: 'S',
      risks: [{ kind: 'k', title: 'T', explanation: 'E', severity: 'low', file_refs: ['/etc/passwd', '../src/a.ts', '%2e%2e/src/a.ts'] }],
      review_focus: [
        { file: '/etc/passwd', line: 1, reason: 'abs' },
        { file: 'src/a.ts', line: -3, reason: 'negative' },
        { file: 'src/a.ts', line: 11, reason: 'ok' },
      ],
    };
    llm.completeStructured = async <T,>(req: StructuredRequest<T>): Promise<StructuredResult<T>> => ({
      data: evil as unknown as T, model: req.model, tokensIn: 1, tokensOut: 1, costUsd: null, raw: '', attempts: 1,
    });
    const t = build({ llm: async () => llm });
    const view = await t.svc.generate('ws-1', 'pr-1', t.log);
    expect(view?.brief?.risks.risks).toEqual([]);
    expect(view?.brief?.review_focus.map((f) => f.reason)).toEqual(['ok']);
  });

  // the in-flight guard is released after a failure, so the next click can run
  it('a failed generation does not leave the PR locked', async () => {
    const t = build();
    const failing = makeLlm({ fail: new Error('x') });
    t.deps.llm = async () => failing.llm;
    const svc = new BriefService(t.deps);
    expect((await svc.generate('ws-1', 'pr-1', t.log))?.failure).toBe('failed');
    t.deps.llm = async () => t.llm;
    const again = await svc.generate('ws-1', 'pr-1', t.log);
    expect(again?.failure).toBeNull();
    expect(again?.generating).toBe(false);
    expect(t.calls).toHaveLength(1);
  });

  // a PR outside the workspace is undefined (404): no model resolved, no call, guard released
  it('an unknown or foreign PR makes no model call', async () => {
    const resolveModel = vi.fn(async () => ({ provider: 'openrouter' as const, model: 'm-1' }));
    const t = build({ resolveModel, repo: { ...build().deps.repo, getPull: async () => undefined } });
    expect(await t.svc.generate('ws-other', 'pr-1', t.log)).toBeUndefined();
    expect(t.calls).toHaveLength(0);
    expect(t.upserts).toHaveLength(0);
  });
});

describe('BriefService.getView', () => {
  it('serves stale when the stored head differs, and null for an unparseable row', async () => {
    const t = build();
    await t.svc.generate('ws-1', 'pr-1', t.log);
    const moved = new BriefService({ ...t.deps, repo: { ...t.deps.repo, getPull: async () => ({ pull: makePull({ headSha: 'sha-2' }), repo: REPO }) } });
    expect((await moved.getView('ws-1', 'pr-1'))?.stale).toBe(true);
    const old = new BriefService({ ...t.deps, repo: { ...t.deps.repo, getBrief: async () => ({ risks: [] }) } });
    const v = await old.getView('ws-1', 'pr-1');
    expect(v?.brief).toBeNull();
    expect(v?.stale).toBe(false);
  });

  it('is undefined for an unknown PR and never calls the model', async () => {
    const t = build({ repo: { ...build().deps.repo, getPull: async () => undefined } });
    expect(await t.svc.getView('ws-1', 'nope')).toBeUndefined();
    expect(t.calls).toHaveLength(0);
  });
});
