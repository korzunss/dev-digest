import type {
  Agent,
  BlastRadius,
  ConventionScanResult,
  PrMeta,
  Repo,
  ReviewRecord,
  ReviewRunResponse,
  RunSummary,
} from '@devdigest/shared';
import type { Clock, DevDigestApi } from '../src/core/ports.js';

export interface FakeApiData {
  repos: Repo[];
  pulls: Record<string, PrMeta[]>;
  agents: Agent[];
  triggerResponse: ReviewRunResponse;
  /** Successive `listRuns` results; the last one repeats. */
  runs: RunSummary[][];
  reviews: ReviewRecord[];
  conventions: ConventionScanResult;
  blast: BlastRadius;
}

export interface FakeApi extends DevDigestApi {
  calls: string[];
  data: FakeApiData;
}

export function makeRepo(over: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-1',
    workspace_id: 'ws',
    provider: 'github',
    api_base: null,
    owner: 'acme',
    name: 'web',
    full_name: 'acme/web',
    default_branch: 'main',
    clone_path: null,
    last_polled_at: null,
    created_by: null,
    ...over,
  } as Repo;
}

export function makePr(over: Partial<PrMeta> = {}): PrMeta {
  return {
    id: 'pull-1',
    number: 7,
    title: 'Add thing',
    author: 'a',
    branch: 'feat',
    base: 'main',
    head_sha: 'abc',
    additions: 1,
    deletions: 0,
    files_count: 1,
    status: 'open',
    ...over,
  } as PrMeta;
}

export function makeAgent(over: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: 'Security',
    description: 'd',
    provider: 'anthropic',
    model: 'm',
    system_prompt: 'SECRET PROMPT',
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
    ...over,
  } as Agent;
}

export function makeRun(over: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: 'run-1',
    agent_id: 'agent-1',
    agent_name: 'Security',
    provider: null,
    model: null,
    status: 'running',
    error: null,
    duration_ms: null,
    tokens_in: null,
    tokens_out: null,
    findings_count: null,
    grounding: null,
    ran_at: null,
    score: null,
    blockers: null,
    cost_usd: null,
    cost_source: null,
    ...over,
  } as RunSummary;
}

export function makeReview(over: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: 'rev-1',
    pr_id: 'pull-1',
    agent_id: 'agent-1',
    run_id: 'run-1',
    agent_name: 'Security',
    kind: 'review',
    verdict: 'comment',
    summary: null,
    score: 80,
    model: null,
    created_at: '2026-01-01T00:00:00Z',
    findings: [],
    ...over,
  } as ReviewRecord;
}

export function makeBlast(over: Partial<BlastRadius> = {}): BlastRadius {
  return {
    changed_symbols: [{ name: 'parse', file: 'src/parse.ts', kind: 'function', rank: 0.5 }],
    downstream: [
      {
        symbol: 'parse',
        callers: [{ name: 'handler', file: 'src/api.ts', line: 12, depth: 1, via: null }],
        endpoints_affected: ['GET /items'],
        crons_affected: [],
        rank: 0.5,
      },
    ],
    summary: '1 changed symbols · 1 callers · 1 endpoints · 0 crons',
    degraded: false,
    reason: null,
    limits: { callers_per_symbol: 10, depth: 2 },
    ...over,
  };
}

/** Recording fake: every call is pushed to `calls` as `name(args)`. */
export function fakeApi(over: Partial<FakeApiData> = {}): FakeApi {
  const data: FakeApiData = {
    repos: [makeRepo()],
    pulls: { 'repo-1': [makePr()] },
    agents: [makeAgent()],
    triggerResponse: {
      pr_id: 'pull-1',
      runs: [{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Security' }],
      reviews: [],
    },
    runs: [[makeRun()]],
    reviews: [],
    conventions: { scan: null, candidates: [] },
    blast: makeBlast(),
    ...over,
  };
  const calls: string[] = [];
  let runsIdx = 0;
  return {
    calls,
    data,
    async listRepos() {
      calls.push('listRepos');
      return data.repos;
    },
    async listPulls(repoId) {
      calls.push(`listPulls(${repoId})`);
      return data.pulls[repoId] ?? [];
    },
    async listAgents() {
      calls.push('listAgents');
      return data.agents;
    },
    async triggerReview(pullId, agentId) {
      calls.push(`triggerReview(${pullId},${agentId})`);
      return data.triggerResponse;
    },
    async listRuns(pullId) {
      calls.push(`listRuns(${pullId})`);
      const r = data.runs[Math.min(runsIdx, data.runs.length - 1)] ?? [];
      runsIdx += 1;
      return r;
    },
    async listReviews(pullId) {
      calls.push(`listReviews(${pullId})`);
      return data.reviews;
    },
    async getConventions(repoId) {
      calls.push(`getConventions(${repoId})`);
      return data.conventions;
    },
    async getBlast(pullId) {
      calls.push(`getBlast(${pullId})`);
      return data.blast;
    },
  };
}

/** Fake clock: `sleep` advances virtual time instantly. */
export function fakeClock(start = 0): Clock & { t: number } {
  const c = {
    t: start,
    now() {
      return c.t;
    },
    async sleep(ms: number) {
      c.t += ms;
    },
  };
  return c;
}
