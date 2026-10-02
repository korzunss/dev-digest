import type { GitClient, LLMProvider, Provider, RepoRef, UnifiedDiff } from '@devdigest/shared';
import { sliceDiff, type RepoRuleSet, type reviewPullRequest } from '@devdigest/reviewer-core';
import { REPLAY_ERROR_MAX_CHARS } from './constants.js';
import type { ReviewEvalFixture } from './fixture.js';
import {
  aggregateRounds,
  evaluateGate,
  scoreSuite,
  type AgentRunInput,
  type EvalFindingInput,
  type GateCheck,
  type RoundsSummary,
  type SuiteScore,
} from './helpers.js';

export type ReplayArm = 'base' | 'opt1' | 'opt1+opt2';
export const REPLAY_ARMS: readonly ReplayArm[] = ['base', 'opt1', 'opt1+opt2'];

/** Arms that load repo rules. */
const usesRules = (arm: ReplayArm): boolean => arm === 'opt1+opt2';

/** An arm needs this share of its rounds complete, or the gate fails. */
export const MIN_COMPLETE_ROUNDS_FRACTION = 0.75;

export interface DbAgent {
  lane: AgentRunInput['lane'];
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  skills: { name: string; rendered: string; enabled: boolean }[];
}

export interface ArmAgent {
  lane: AgentRunInput['lane'];
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  /** Rendered skill blocks, in attach order. */
  skills: string[];
}

type ReviewFn = typeof reviewPullRequest;
type ReviewParams = Parameters<ReviewFn>[0];

export interface ReplayDeps {
  git: Pick<GitClient, 'diffCommits' | 'readFileAt'>;
  llmFor(provider: Provider): LLMProvider;
  review: ReviewFn;
  loadRules: (
    git: Pick<GitClient, 'readFileAt'>,
    repo: RepoRef,
    baseSha: string | null | undefined,
    paths: readonly string[],
  ) => Promise<{ sets: RepoRuleSet[] }>;
  countTokens?: (s: string) => number;
  estimateCost?: (model: string, tokensIn: number, tokensOut: number) => number | null;
  callOptions: Pick<
    ReviewParams,
    'callDeadlineMs' | 'maxOutputTokens' | 'routing' | 'retryRouting' | 'maxSkippedChunkFraction'
  >;
}

export interface ReplayOptions {
  rounds: number;
  arms: readonly ReplayArm[];
  concurrency: number;
  strategy: NonNullable<ReviewParams['strategy']>;
  repo: RepoRef;
  pull: { body: string | null };
  task: string;
  dbAgents: DbAgent[];
  builtinPrompts: Readonly<Record<string, string>>;
  /** General's skills that the opt arms drop. */
  detachedSkills: readonly string[];
  generalAgentName: string;
  repoRulesMaxChars: number;
  /** Bound on the `diffCommits` call; aborting kills the git process. */
  diffTimeoutMs: number;
  onProgress?: (e: ReplayProgress) => void;
}

export interface ReplayProgress {
  arm: ReplayArm;
  round: number;
  agent: string;
  ok: boolean;
  /** Why the job failed: one sanitized line, set only when `ok` is false. */
  error?: string;
  findings: number;
  costUsd: number | null;
  seconds: number;
}

export interface ReplayGateCheck {
  name: GateCheck['name'] | 'rounds';
  arm?: ReplayArm;
  pass: boolean;
  actual: number | null;
  limit: number;
}

export interface ArmResult {
  summary: RoundsSummary;
  completeRounds: number;
  failedJobs: number;
  skippedChunks: number;
}

export interface ReplayResult {
  arms: Partial<Record<ReplayArm, ArmResult>>;
  gate: ReplayGateCheck[];
  /** `null` when the gate was skipped (the base and opt1+opt2 arms did not both run). */
  gatePassed: boolean | null;
  fixtureFiles: string[];
  missingFixtureFiles: string[];
  allPathsCount: number;
}

/** The agents each arm reviews with. Only enabled skills are used. */
export function buildArmAgents(
  arm: ReplayArm,
  dbAgents: readonly DbAgent[],
  builtinPrompts: Readonly<Record<string, string>>,
  detached: readonly string[],
  generalAgentName: string,
): ArmAgent[] {
  return dbAgents.map((a) => {
    let systemPrompt = a.systemPrompt;
    let skills = a.skills.filter((s) => s.enabled);
    if (arm !== 'base') {
      const prompt = builtinPrompts[a.name];
      if (prompt === undefined) throw new Error(`no built-in prompt for agent "${a.name}"`);
      systemPrompt = prompt;
      if (a.name === generalAgentName) skills = skills.filter((s) => !detached.includes(s.name));
    }
    return {
      lane: a.lane,
      name: a.name,
      provider: a.provider,
      model: a.model,
      systemPrompt,
      skills: skills.map((s) => s.rendered),
    };
  });
}

function fixtureLocationFiles(fixture: ReviewEvalFixture): string[] {
  const files = new Set<string>();
  for (const issue of [...fixture.issues, ...fixture.acceptable_extras, ...fixture.false_positives]) {
    for (const loc of issue.locations) files.add(loc.file);
  }
  return [...files];
}

/** Runs `tasks` with at most `limit` in flight. Each task handles its own errors. */
async function pool(limit: number, tasks: (() => Promise<void>)[]): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++] as () => Promise<void>;
      await task();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

interface JobResult {
  ok: boolean;
  run?: AgentRunInput;
  skipped: number;
  error?: string;
}

/** First line of an error message, with token-like strings redacted and the length capped. */
export function describeJobError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const line = (raw.split('\n')[0] ?? '').trim();
  const redacted = line.replace(/\b(sk-[\w-]+|Bearer\s+\S+|[A-Za-z0-9_-]{32,})/g, '[redacted]');
  const text = redacted || 'unknown error';
  return text.length > REPLAY_ERROR_MAX_CHARS ? `${text.slice(0, REPLAY_ERROR_MAX_CHARS - 1)}…` : text;
}

export async function runReplay(
  fixture: ReviewEvalFixture,
  opts: ReplayOptions,
  deps: ReplayDeps,
): Promise<ReplayResult> {
  if (!fixture.base_sha) throw new Error('fixture has no base_sha: pin the range to replay it');
  const baseSha = fixture.base_sha;

  const diff = await deps.git.diffCommits(
    opts.repo,
    baseSha,
    fixture.head_sha,
    AbortSignal.timeout(opts.diffTimeoutMs),
  );
  const allPaths = diff.files.map((f) => f.path);
  const inDiff = new Set(allPaths);
  const wanted = fixtureLocationFiles(fixture);
  const fixtureFiles = wanted.filter((p) => inDiff.has(p));
  const missingFixtureFiles = wanted.filter((p) => !inDiff.has(p));
  const subDiff: UnifiedDiff = {
    files: diff.files.filter((f) => fixtureFiles.includes(f.path)),
    raw: fixtureFiles.map((p) => sliceDiff(diff, p)).join('\n'),
  };

  const rules = opts.arms.some(usesRules)
    ? (await deps.loadRules(deps.git, opts.repo, baseSha, allPaths)).sets
    : [];

  const armAgents = new Map<ReplayArm, ArmAgent[]>(
    opts.arms.map((arm) => [
      arm,
      buildArmAgents(arm, opts.dbAgents, opts.builtinPrompts, opts.detachedSkills, opts.generalAgentName),
    ]),
  );

  const results = new Map<string, JobResult>();
  const tasks: (() => Promise<void>)[] = [];
  for (const arm of opts.arms) {
    for (let round = 1; round <= opts.rounds; round++) {
      for (const agent of armAgents.get(arm) ?? []) {
        tasks.push(async () => {
          const started = Date.now();
          let result: JobResult;
          let costUsd: number | null = null;
          try {
            const outcome = await deps.review({
              systemPrompt: agent.systemPrompt,
              model: agent.model,
              diff: subDiff,
              llm: deps.llmFor(agent.provider),
              strategy: opts.strategy,
              ...(agent.skills.length > 0 ? { skills: agent.skills } : {}),
              ...(opts.pull.body ? { prDescription: opts.pull.body } : {}),
              task: opts.task,
              ...(deps.countTokens ? { countTokens: deps.countTokens } : {}),
              ...(deps.estimateCost ? { estimateCost: deps.estimateCost } : {}),
              ...deps.callOptions,
              requireParameters: true,
              ...(usesRules(arm)
                ? {
                    ...(rules.length > 0 ? { repoRules: rules } : {}),
                    changedFiles: allPaths,
                    repoRulesMaxChars: opts.repoRulesMaxChars,
                  }
                : {}),
            });
            costUsd = outcome.costUsd;
            const findings: EvalFindingInput[] = outcome.review.findings.map((f, i) => ({
              id: `${arm}:${round}:${agent.name}:${i}`,
              file: f.file,
              start_line: f.start_line,
              end_line: f.end_line,
              category: f.category,
              severity: f.severity,
              title: f.title,
              rationale: f.rationale,
            }));
            result = {
              ok: true,
              skipped: outcome.skipped.length,
              run: {
                agentName: agent.name,
                lane: agent.lane,
                runId: `${arm}:${round}:${agent.name}`,
                durationMs: Date.now() - started,
                costUsd,
                findings,
              },
            };
          } catch (err) {
            result = { ok: false, skipped: 0, error: describeJobError(err) };
          }
          results.set(`${arm}:${round}:${agent.name}`, result);
          opts.onProgress?.({
            arm,
            round,
            agent: agent.name,
            ok: result.ok,
            ...(result.error ? { error: result.error } : {}),
            findings: result.run?.findings.length ?? 0,
            costUsd,
            seconds: (Date.now() - started) / 1000,
          });
        });
      }
    }
  }
  await pool(opts.concurrency, tasks);

  const plantedCount = fixture.issues.length;
  const arms: Partial<Record<ReplayArm, ArmResult>> = {};
  for (const arm of opts.arms) {
    const agents = armAgents.get(arm) ?? [];
    const scored: SuiteScore[] = [];
    let failedJobs = 0;
    let skippedChunks = 0;
    for (let round = 1; round <= opts.rounds; round++) {
      const jobs = agents.map((a) => results.get(`${arm}:${round}:${a.name}`));
      for (const j of jobs) {
        if (!j?.ok) failedJobs++;
        skippedChunks += j?.skipped ?? 0;
      }
      const runs = jobs.flatMap((j) => (j?.ok && j.run ? [j.run] : []));
      if (runs.length === agents.length) scored.push(scoreSuite(fixture, runs));
    }
    arms[arm] = {
      summary: aggregateRounds(scored, plantedCount),
      completeRounds: scored.length,
      failedJobs,
      skippedChunks,
    };
  }

  const base = arms.base;
  const opt = arms['opt1+opt2'];
  const gate: ReplayGateCheck[] = [];
  let gatePassed: boolean | null = null;
  if (base && opt) {
    const required = Math.ceil(MIN_COMPLETE_ROUNDS_FRACTION * opts.rounds);
    for (const arm of ['base', 'opt1+opt2'] as const) {
      const complete = arms[arm]?.completeRounds ?? 0;
      if (complete < required) gate.push({ name: 'rounds', arm, pass: false, actual: complete, limit: required });
    }
    const b = base.summary;
    gate.push(
      ...evaluateGate(
        opt.summary,
        {
          ...(b.suiteRecall ? { suiteRecall: b.suiteRecall.mean } : {}),
          // D8: the false-CRITICAL gate only applies to a fixture that labels false positives.
          ...(fixture.false_positives.length > 0 ? { falseCriticals: b.falseCriticals.mean } : {}),
          ...(b.costUsd ? { costUsd: b.costUsd.mean } : {}),
        },
        plantedCount,
      ),
    );
    gatePassed = gate.every((c) => c.pass);
  }

  return { arms, gate, gatePassed, fixtureFiles, missingFixtureFiles, allPathsCount: allPaths.length };
}

const fmt = (v: number | null) => (v === null ? 'n/a' : v.toFixed(4));

/** One line per gate check, e.g. `gate falseCriticals: PASS (actual 1.0000 limit 3.5000)`. */
export function formatGate(result: Pick<ReplayResult, 'gate' | 'gatePassed'>): string[] {
  if (result.gatePassed === null) return ['gate: skipped (needs the base and opt1+opt2 arms)'];
  const lines = result.gate.map(
    (c) =>
      `gate ${c.name}${c.arm ? ` [${c.arm}]` : ''}: ${c.pass ? 'PASS' : 'FAIL'} (actual ${fmt(c.actual)} limit ${fmt(c.limit)})`,
  );
  lines.push(result.gatePassed ? 'gate: PASS' : 'gate: FAIL');
  return lines;
}
