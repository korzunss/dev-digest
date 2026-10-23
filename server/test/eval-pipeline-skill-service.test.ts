import { describe, it, expect } from 'vitest';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import type { Review } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { ConfigError } from '../src/platform/errors.js';
import { EvalSkillSuiteService } from '../src/modules/eval/skill-suite-service.js';
import type { EvalPipelineRepository, SuiteCaseRow } from '../src/modules/eval/repository/pipeline.repo.js';
import type { EvalSkill, EvalSkillSuiteServiceDeps } from '../src/modules/eval/types.js';

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,4 @@',
  ' one',
  '+two',
  '+three',
  ' four',
  '',
].join('\n');
const EXPECTED = [{ expect: 'must_find', file: 'src/a.ts', start_line: 2, end_line: 2 }];
const WS = 'ws1';
const PICK = { provider: 'openai' as const, model: 'gpt-4.1' };

const REVIEW: Review = {
  verdict: 'comment',
  summary: 's',
  score: 80,
  findings: [
    { id: 'f', severity: 'WARNING', category: 'bug', title: 'T', file: 'src/a.ts', start_line: 2, end_line: 2, rationale: 'r', confidence: 0.9 },
  ],
};

function caseRow(id: string, name: string, over: Partial<SuiteCaseRow> = {}): SuiteCaseRow {
  return {
    id,
    workspaceId: WS,
    agentId: null,
    skillId: 'sk1',
    name,
    inputDiff: DIFF,
    inputFiles: ['src/a.ts'],
    inputMeta: null,
    expected: EXPECTED,
    sourceFindingId: null,
    sourcePrId: null,
    lastResult: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  } as SuiteCaseRow;
}

/** In-memory stand-in for the repository methods the skill service uses. */
function fakeRepo(initial: SuiteCaseRow[] = []) {
  const rows = new Map(initial.map((r) => [r.id, r]));
  let n = 100;
  const repo = {
    rows,
    inserts: 0,
    listCases: async () => [...rows.values()],
    caseNames: async () => [...rows.values()].map((r) => r.name),
    countCases: async () => rows.size,
    getCase: async (_ws: string, id: string) => rows.get(id) ?? null,
    insertCase: async (v: { name: string; skillId: string | null; inputDiff: string; expected: unknown }) => {
      repo.inserts += 1;
      const row = caseRow(`c${n++}`, v.name, { inputDiff: v.inputDiff, expected: v.expected });
      rows.set(row.id, row);
      return row;
    },
    setLastResult: async (_ws: string, id: string, result: unknown) => {
      const r = rows.get(id);
      if (r) rows.set(id, { ...r, lastResult: result });
    },
  };
  return repo;
}

function setup(opts: { cases?: SuiteCaseRow[]; skill?: Partial<EvalSkill>; llmFails?: boolean; review?: Review } = {}) {
  const repo = fakeRepo(opts.cases);
  const skill: EvalSkill = { id: 'sk1', name: 'S', version: 2, enabled: true, rendered: 'BODY', paths: [], ...opts.skill };
  const llm = new MockLLMProvider('openai', { structured: opts.review ?? REVIEW });
  const deps: EvalSkillSuiteServiceDeps = {
    repo: repo as unknown as EvalPipelineRepository,
    skills: {
      getById: async (_ws, id) => (id === skill.id ? skill : undefined),
      agentsUsing: async () => [],
      defaultPick: async () => PICK,
    },
    llm: async () => {
      if (opts.llmFails) throw new ConfigError('no key');
      return llm;
    },
    review: reviewPullRequest,
    parseDiff: (raw) => {
      if (raw === 'not a diff') throw new Error('cannot parse');
      return parseUnifiedDiff(raw);
    },
    callOptions: {},
    now: () => new Date('2026-01-01T00:00:00Z'),
  };
  return { svc: new EvalSkillSuiteService(deps), repo, llm, skill };
}

const body = (name: string, token?: string) => ({
  name,
  input: { diff: DIFF },
  expected_output: EXPECTED,
  ...(token ? { draft_run_token: token } : {}),
});

async function settled(check: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !check(); i += 1) await new Promise((r) => setTimeout(r, 5));
}

describe('EvalSkillSuiteService', () => {
  it('guards names per skill (a taken name is refused)', async () => {
    const { svc } = setup({ cases: [caseRow('c1', 'dup')] });
    await expect(svc.createCase(WS, 'sk1', body('dup'))).rejects.toMatchObject({ statusCode: 422 });
  });

  it('404s for an unknown skill', async () => {
    const { svc } = setup();
    await expect(svc.listCases(WS, 'nope')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses with no_api_key before writing or spending (AC-79)', async () => {
    const { svc, repo, llm } = setup({ llmFails: true, cases: [caseRow('c1', 'a')] });
    await expect(svc.draftRun(WS, 'sk1', { ...body('x'), ...PICK })).rejects.toMatchObject({ code: 'no_api_key' });
    await expect(svc.startSuiteRun(WS, 'sk1', PICK)).rejects.toMatchObject({ code: 'no_api_key' });
    expect(llm.calls).toHaveLength(0);
    expect(repo.rows.get('c1')?.lastResult).toBeNull();
  });

  it('attaches a draft result only when version and pick still match, and the token is single-use', async () => {
    const a = setup();
    const draft = await a.svc.draftRun(WS, 'sk1', { ...body('x'), ...PICK });
    const saved = await a.svc.createCase(WS, 'sk1', body('x', draft.run_token));
    expect(saved.last_result).not.toBeNull();
    // The token was consumed: a second save with it gets no result.
    const again = await a.svc.createCase(WS, 'sk1', body('y', draft.run_token));
    expect(again.last_result).toBeNull();

    // The skill moved to a new version after the draft run: no result attaches.
    const b = setup();
    const d2 = await b.svc.draftRun(WS, 'sk1', { ...body('x'), ...PICK });
    b.skill.version = 3;
    expect((await b.svc.createCase(WS, 'sk1', body('x', d2.run_token))).last_result).toBeNull();
  });

  it('runs the whole suite in the background with progress, an errored case does not stop the rest, and a disabled skill still runs', async () => {
    const bad = caseRow('c2', 'broken', { inputDiff: 'not a diff' });
    const { svc, repo } = setup({ cases: [caseRow('c1', 'ok'), bad], skill: { enabled: false } });
    const state = await svc.startSuiteRun(WS, 'sk1', PICK);
    expect(state.progress).toEqual({ done: 0, total: 2 });
    await expect(svc.startSuiteRun(WS, 'sk1', PICK)).rejects.toMatchObject({ code: 'run_in_progress', statusCode: 409 });
    await settled(() => (repo.rows.get('c1')?.lastResult ?? null) !== null && (repo.rows.get('c2')?.lastResult ?? null) !== null);
    expect(repo.rows.get('c2')?.lastResult).toMatchObject({ status: 'errored' });
    expect(repo.rows.get('c1')?.lastResult).toMatchObject({ status: 'passed', skill_version: 2 });
    await new Promise((r) => setTimeout(r, 20));
    expect((await svc.runState(WS, 'sk1')).progress).toBeNull();
  });

  it('refuses an empty suite and exposes the default pick in the run state', async () => {
    const { svc } = setup();
    await expect(svc.startSuiteRun(WS, 'sk1', PICK)).rejects.toMatchObject({ code: 'suite_empty' });
    expect(await svc.runState(WS, 'sk1')).toMatchObject({ progress: null, default_pick: PICK, skill: { id: 'sk1', enabled: true } });
  });

  // A suite is capped at 200 cases: Save and Run all evals refuse past it and spend nothing.
  it('refuses a 201st case and a run over the cap with suite_too_large', async () => {
    const full = Array.from({ length: 200 }, (_, i) => caseRow(`c${i}`, `n${i}`));
    const { svc, repo, llm } = setup({ cases: full });
    await expect(svc.createCase(WS, 'sk1', body('one-more'))).rejects.toMatchObject({ code: 'suite_too_large', statusCode: 422 });
    expect(repo.inserts).toBe(0);

    const over = setup({ cases: [...full, caseRow('c200', 'n200')] });
    await expect(over.svc.startSuiteRun(WS, 'sk1', PICK)).rejects.toMatchObject({ code: 'suite_too_large' });
    expect(over.llm.calls).toHaveLength(0);
    expect(llm.calls).toHaveLength(0);
    // The refused start leaves no stale guard behind.
    await expect(over.svc.startSuiteRun(WS, 'sk1', PICK)).rejects.toMatchObject({ code: 'suite_too_large' });
  });

  // A failed start releases the per-skill guard, so the user can retry once the key is fixed.
  it('releases the in-progress guard after a refused start', async () => {
    const { svc } = setup({ llmFails: true, cases: [caseRow('c1', 'a')] });
    await expect(svc.startSuiteRun(WS, 'sk1', PICK)).rejects.toMatchObject({ code: 'no_api_key' });
    await expect(svc.startSuiteRun(WS, 'sk1', PICK)).rejects.toMatchObject({ code: 'no_api_key' });
  });

  // The single-case path only serves skill cases: an agent-owned row is not found, with no model call.
  it('treats an agent-owned row as not found on a single skill-case run', async () => {
    const { svc, llm } = setup();
    const agentRow = caseRow('a1', 'agent-case', { agentId: 'ag1', skillId: null });
    await expect(svc.runSavedCase(WS, agentRow, PICK)).rejects.toMatchObject({ statusCode: 404 });
    expect(llm.calls).toHaveLength(0);
  });

  // A single run checks the key before it writes anything onto the case.
  it('refuses a single run with no_api_key and leaves the case untouched', async () => {
    const { svc, repo } = setup({ llmFails: true, cases: [caseRow('c1', 'a')] });
    await expect(svc.runSavedCase(WS, repo.rows.get('c1')!, PICK)).rejects.toMatchObject({ code: 'no_api_key' });
    expect(repo.rows.get('c1')?.lastResult).toBeNull();
  });
});
