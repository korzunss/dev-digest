import type { ZodType } from 'zod';
import type {
  CostSource,
  Finding,
  Intent,
  LLMProvider,
  LlmRouting,
  PromptAssembly,
  Review,
  RunEventKind,
  UnifiedDiff,
} from '@devdigest/shared';
import { Review as ReviewSchema } from '@devdigest/shared';
import { assemblePrompt, type ContextDoc } from '../prompt.js';
import { groundFindings, groundingSummary, type GroundingResult } from '../grounding.js';
import { groupBySkillSet, skillsForFile, specsForCall, type PathMatcher, type ScopedSkillInput } from './skill-routing.js';
import { reduceReviews, scoreFromFindings, sliceDiff, verdictFromFindings } from './reduce.js';
import { summarizeFindings } from './summary.js';
import { callWithDeadline, describeRouting, type FailedCallUsage } from './llm-call.js';
import { LlmOutputInvalidError, LlmOutputTruncatedError } from '../llm/errors.js';
import { buildRepoContext, type RepoRuleSet } from './repo-rules.js';
import { applyScopeFilter, ScopedReview, type ScopedFinding } from './scope.js';

/**
 * reviewPullRequest — the review engine entry point.
 *
 * given (diff + resolved agent inputs + injected LLM) → grounded Review.
 *
 * This is the pure core lifted out of the server's `ReviewService.runOneAgent`:
 * assemble prompt → single-pass OR map-reduce per file → reduce → SHARED
 * citation-grounding gate. It performs NO I/O beyond the injected LLM provider
 * (no DB, GitHub, fs, memory retrieval, intent, or persistence) — those stay in
 * the caller (server persists + streams SSE; runner posts + writes an artifact).
 *
 * Skill bodies / memory / specs are RESOLVED strings here: the caller turns
 * AgentManifest skill slugs into bodies (DB in the studio, fs in the runner).
 */

/** Default map-reduce threshold (matches the server's FILE_MAP_THRESHOLD_LINES). */
export const DEFAULT_MAP_THRESHOLD_LINES = 400;
/** Default structured-output reprompt retries (matches REVIEW_MAX_RETRIES). */
export const DEFAULT_REVIEW_MAX_RETRIES = 2;
/**
 * Default diff size (tokens) above which a multi-file diff is reviewed
 * map-reduce even for a `single-pass` agent (assumption: 100k).
 */
export const DEFAULT_SINGLE_PASS_MAX_DIFF_TOKENS = 100_000;

export type ReviewStrategy = 'auto' | 'single-pass' | 'map-reduce';
export type ReviewMode = 'single-pass' | 'map-reduce';

/** Progress event emitted during a review (server → SSE bus, runner → log). */
export interface ReviewEvent {
  kind: RunEventKind;
  msg: string;
  data?: unknown;
}

export interface ReviewInput {
  /** Agent system prompt (trusted). */
  systemPrompt: string;
  /** Model id understood by the injected provider (e.g. 'deepseek/deepseek-v4-flash'). */
  model: string;
  /**
   * The PR's unified diff (already parsed; hunks carry new-side line numbers).
   * `deletedPaths` (from `parseUnifiedDiff`) are the old paths of deleted files; they
   * take part in skill routing only.
   */
  diff: UnifiedDiff & { deletedPaths?: string[] };
  /** Injected LLM provider (OpenRouter in CI, OpenAI/Anthropic in the studio). */
  llm: LLMProvider;
  /** 'auto' (default) picks single-pass unless the diff is large + multi-file. */
  strategy?: ReviewStrategy;
  /** Resolved skill bodies (NOT slugs). Applied to every call; ignored when `scopedSkills` is set. */
  skills?: string[];
  /**
   * Skills with the globs they apply to (empty `paths` = every file). When set, a
   * single-pass review groups files by the exact skill set that applies and makes
   * one call per group; map-reduce gives each file its own skills.
   */
  scopedSkills?: ScopedSkillInput[];
  /** Glob matcher injected by the caller (the engine parses no globs). Absent ⇒ every skill counts as unscoped. */
  matchesPath?: PathMatcher;
  /** Repo context items (untrusted; rendered as `## Repo context`). */
  memory?: string[];
  /**
   * Repo rule sets (plan 10), loaded by the caller at the PR's base SHA. Each
   * chunk gets the root sets plus those whose `scope` prefixes one of its paths.
   */
  repoRules?: RepoRuleSet[];
  /**
   * The PR's FULL changed-path list (even when the caller reviews a subset of
   * the diff). Rendered into every chunk's repo context. Absent ⇒ no list.
   */
  changedFiles?: string[];
  /** Cap on the rule text per chunk. Default `DEFAULT_REPO_RULES_MAX_CHARS`. */
  repoRulesMaxChars?: number;
  /** Project-context documents (untrusted; delimiter-wrapped downstream). */
  specs?: ContextDoc[];
  /**
   * Optional callers-of-changed-symbols digest (T1.3). Untrusted; rendered
   * before the diff section. Empty/undefined → section omitted.
   */
  callers?: string;
  /**
   * Optional repo skeleton / map (T3). Untrusted; rendered before the project
   * context section. Empty/undefined → section omitted.
   */
  repoMap?: string;
  /** PR author's description/body (untrusted; truncated + delimiter-wrapped in
      the prompt). Empty/undefined → section omitted. */
  prDescription?: string;
  /**
   * Structured PR intent (spec 006), resolved by the caller's IntentService.
   * When set, the prompt gains a `## PR intent` untrusted block + a trusted
   * scope rule, and findings the model marks `out_of_scope` are filtered
   * AFTER grounding (grounding is never loosened). Absent ⇒ identical to
   * today's behavior (same schema, same prompt, no scope step).
   */
  intent?: Intent;
  /**
   * Injected token counter for the prompt trace's `sections` (e.g. the
   * server's tiktoken adapter). Falls back to a chars/4 estimate when absent.
   */
  countTokens?: (s: string) => number;
  /**
   * Price book for estimating a deadline-aborted attempt; absent ⇒ that
   * attempt's tokens are counted unpriced.
   */
  estimateCost?: (model: string, tokensIn: number, tokensOut: number) => number | null;
  /** Task framing line, e.g. "Review PR #482 …". */
  task?: string;
  /** Override the structured-output retry budget. */
  maxRetries?: number;
  /** Override the map-reduce line threshold. */
  mapThresholdLines?: number;
  /**
   * OpenRouter session id — forwarded on every LLM call so all chunks of this
   * review group into one session in the OpenRouter dashboard.
   */
  sessionId?: string;
  /** Progress sink. */
  onEvent?: (e: ReviewEvent) => void;
  /**
   * Cancellation checkpoint, called before each (expensive) chunk LLM call.
   * Supply a function that THROWS to abort mid-run (the caller owns the error
   * type, e.g. the server's RunCancelledError); the engine stays agnostic.
   */
  checkCancelled?: () => void;
  /** Run-level cancellation; aborts the in-flight LLM call (passed as `req.signal`). */
  signal?: AbortSignal;
  /** Per-call deadline in ms (no answer → abort + one retry). Unset = none. */
  callDeadlineMs?: number;
  /** Output-token safety cap sent as `max_tokens` on every call. Unset = none. */
  maxOutputTokens?: number;
  /** OpenRouter: only route to endpoints supporting every request parameter. */
  requireParameters?: boolean;
  /** Gateway routing hint for the first attempt. */
  routing?: LlmRouting;
  /** Gateway routing hint for the single retry (e.g. `{}` = default balancing). */
  retryRouting?: LlmRouting;
  /** Override DEFAULT_SINGLE_PASS_MAX_DIFF_TOKENS. */
  singlePassMaxDiffTokens?: number;
  /**
   * Map-reduce only: a chunk whose final error is truncated/invalid output is skipped while
   * skipped ≤ max(1, floor(chunks × fraction)); unset = never skip (any final error fails the run).
   */
  maxSkippedChunkFraction?: number;
}

/** Thrown when too many chunks were skipped, or when no chunk produced a review at all. */
export class ReviewChunksSkippedError extends Error {
  constructor(
    readonly skipped: number,
    readonly total: number,
    message: string,
  ) {
    super(message);
    this.name = 'ReviewChunksSkippedError';
  }
}

export interface ReviewOutcome {
  /**
   * The reduced, GROUNDED review (findings that survived the citation gate). Verdict, score
   * and the map-reduce summary are derived from those final findings, not from model output.
   */
  review: Review;
  /** Human-readable grounding summary, e.g. "3/4 passed". */
  grounding: string;
  /** Findings dropped by grounding, with reasons (for logs / "never go silent"). */
  dropped: { finding: Finding; reason: string }[];
  /** Which path ran. */
  mode: ReviewMode;
  /** Prompt assembly (for the run trace). Single-pass: the one call; map-reduce: the whole-diff assembly. */
  assembly: PromptAssembly;
  /** Per-chunk labels (for the run trace's tool_calls). */
  chunks: { label: string }[];
  /** Every LLM call actually made, with the files and skill ids it carried (skill ids empty without `scopedSkills`). */
  calls: { label: string; paths: string[]; skillIds: string[]; ok: boolean }[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  /**
   * Provenance of `costUsd`, aggregated WORST-WINS over the calls this run made:
   * a map-reduce run is `api` only when every chunk reported a real price, and
   * `estimate` as soon as one was priced from tokens. Null when there is no cost.
   */
  costSource: CostSource | null;
  /** Joined raw model outputs (for the run trace). */
  raw: string;
  /** Chunks skipped on truncated/invalid output (empty when nothing was skipped). */
  skipped: { label: string; reason: string }[];
}

type ModeReason = 'strategy' | 'size-guard' | 'oversize-single-file';

function selectMode(
  strategy: ReviewStrategy,
  diff: UnifiedDiff,
  threshold: number,
  diffTokens: number,
  maxSinglePassTokens: number,
): { mode: ReviewMode; reason: ModeReason } {
  let mode: ReviewMode;
  if (strategy === 'single-pass') mode = 'single-pass';
  else if (strategy === 'map-reduce') mode = diff.files.length > 1 ? 'map-reduce' : 'single-pass';
  else {
    // auto: map-reduce only when the diff is both large AND multi-file (else 1 call).
    const totalLines = diff.files.reduce((n, f) => n + f.additions + f.deletions, 0);
    mode = totalLines > threshold && diff.files.length > 1 ? 'map-reduce' : 'single-pass';
  }
  // Size guard: no single call for a huge diff, whatever the strategy.
  if (mode === 'single-pass' && diffTokens > maxSinglePassTokens) {
    return diff.files.length > 1
      ? { mode: 'map-reduce', reason: 'size-guard' }
      : { mode, reason: 'oversize-single-file' };
  }
  return { mode, reason: 'strategy' };
}

/** Running token/cost totals of a review, across reviewed and skipped chunks. */
interface UsageTotals {
  tokensIn: number;
  tokensOut: number;
  /** null once any chunk could not be priced. */
  costUsd: number | null;
  costSource: CostSource | undefined;
}

/** Adds one call's usage. Cost source is worst-wins: one estimate makes the whole run an estimate. */
function addUsage(
  acc: UsageTotals,
  u: { tokensIn: number; tokensOut: number; costUsd: number | null; costSource: CostSource | undefined },
): void {
  acc.tokensIn += u.tokensIn;
  acc.tokensOut += u.tokensOut;
  acc.costUsd = acc.costUsd == null || u.costUsd == null ? null : acc.costUsd + u.costUsd;
  if (u.costSource === 'estimate') acc.costSource = 'estimate';
  else if (u.costSource === 'api' && acc.costSource !== 'estimate') acc.costSource = 'api';
}

type ChunkCall = Awaited<ReturnType<typeof callWithDeadline<Review>>>;
type SkippableError = LlmOutputTruncatedError | LlmOutputInvalidError;

/**
 * One chunk's LLM call. A truncated / invalid output becomes `{ ok: false }`
 * (with the failed call's usage, when known) only when `canSkip`; every other
 * error, and any error when skipping is off, propagates unchanged.
 */
async function reviewChunk(
  input: ReviewInput,
  opts: {
    label: string;
    messages: ReturnType<typeof assemblePrompt>['messages'];
    schema: ZodType<Review>;
    maxRetries: number;
    canSkip: boolean;
    emit: (kind: RunEventKind, msg: string, data?: unknown) => void;
  },
): Promise<{ ok: true; res: ChunkCall } | { ok: false; err: SkippableError; usage?: FailedCallUsage }> {
  // A box, not a `let`: a closure assignment to a `let` is invisible to narrowing in the catch below.
  const failed: { usage?: FailedCallUsage } = {};
  try {
    const res = await callWithDeadline<Review>({
      llm: input.llm,
      request: {
        model: input.model,
        schema: opts.schema,
        schemaName: 'Review',
        messages: opts.messages,
        maxRetries: opts.maxRetries,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        ...(input.maxOutputTokens != null ? { maxTokens: input.maxOutputTokens } : {}),
        ...(input.requireParameters != null ? { requireParameters: input.requireParameters } : {}),
        ...(input.routing ? { routing: input.routing } : {}),
      },
      ...(input.retryRouting ? { retryRouting: input.retryRouting } : {}),
      ...(input.callDeadlineMs != null ? { deadlineMs: input.callDeadlineMs } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.checkCancelled ? { checkCancelled: input.checkCancelled } : {}),
      ...(input.estimateCost ? { estimateCost: input.estimateCost } : {}),
      ...(input.countTokens ? { countTokens: input.countTokens } : {}),
      label: opts.label,
      emit: opts.emit,
      onFinalFailure: (u) => {
        failed.usage = u;
      },
    });
    return { ok: true, res };
  } catch (err) {
    if (!opts.canSkip || !(err instanceof LlmOutputTruncatedError || err instanceof LlmOutputInvalidError)) {
      throw err;
    }
    return { ok: false, err, ...(failed.usage ? { usage: failed.usage } : {}) };
  }
}

export async function reviewPullRequest(input: ReviewInput): Promise<ReviewOutcome> {
  const threshold = input.mapThresholdLines ?? DEFAULT_MAP_THRESHOLD_LINES;
  const maxRetries = input.maxRetries ?? DEFAULT_REVIEW_MAX_RETRIES;
  const diffTokens = input.countTokens?.(input.diff.raw) ?? Math.ceil(input.diff.raw.length / 4);
  const maxSinglePass = input.singlePassMaxDiffTokens ?? DEFAULT_SINGLE_PASS_MAX_DIFF_TOKENS;
  const { mode, reason } = selectMode(
    input.strategy ?? 'auto',
    input.diff,
    threshold,
    diffTokens,
    maxSinglePass,
  );
  const emit = (kind: RunEventKind, msg: string, data?: unknown) =>
    input.onEvent?.({ kind, msg, data });

  const allPaths = input.diff.files.map((f) => f.path);
  const deletedPaths = input.diff.deletedPaths ?? [];
  const hasRepoContext = input.repoRules !== undefined || input.changedFiles !== undefined;
  // Per-chunk memory: caller memory + the rule sets scoped to the chunk's paths
  // + the changed-file list. With neither field set, `memory` passes through.
  const memoryFor = (chunkPaths: string[]): string[] | undefined => {
    if (!hasRepoContext) return input.memory;
    const items = [
      ...(input.memory ?? []),
      ...buildRepoContext(input.repoRules ?? [], chunkPaths, input.changedFiles, {
        ...(input.repoRulesMaxChars != null ? { rulesMaxChars: input.repoRulesMaxChars } : {}),
      }),
    ];
    return items.length > 0 ? items : undefined;
  };

  // Skill routing (stack-scoped guidance). Without `scopedSkills` the flat
  // `skills` apply to every call, as before. Without `matchesPath` a scoped
  // skill counts as unscoped.
  const scoped = input.scopedSkills;
  const match: PathMatcher = input.matchesPath ?? (() => true);
  const skillBodies = (idx: number[]): string[] | undefined =>
    scoped ? idx.map((i) => scoped[i]!.body) : input.skills;
  const skillIdsOf = (idx: number[]): string[] => (scoped ? idx.map((i) => scoped[i]!.id) : []);
  const specsFor = (idx: number[]): ContextDoc[] | undefined =>
    scoped ? specsForCall(input.specs, skillIdsOf(idx)) : input.specs;
  const unscopedIdx = scoped ? scoped.flatMap((s, i) => (s.paths.length === 0 ? [i] : [])) : [];
  // Every skill that applies to at least one changed (or deleted) file.
  const wholeSkillIdx = (() => {
    if (!scoped) return [];
    const set = new Set<number>(unscopedIdx);
    for (const p of [...allPaths, ...deletedPaths]) for (const i of skillsForFile(scoped, p, match)) set.add(i);
    return [...set].sort((a, b) => a - b);
  })();

  const promptParts = {
    system: input.systemPrompt,
    callers: input.callers,
    repoMap: input.repoMap,
    prDescription: input.prDescription,
    task: input.task,
    intent: input.intent,
  };
  const assembleOpts = input.countTokens ? { countTokens: input.countTokens } : undefined;
  // With intent, validate against ScopedReview (Finding + optional out_of_scope)
  // so the model's scope flag survives structured-output parsing; the
  // schemaName stays 'Review' either way (out_of_scope is model-facing only).
  const reviewSchema = (input.intent ? ScopedReview : ReviewSchema) as ZodType<Review>;

  // Whole-diff assembly is the trace default; overwritten below when one call ran.
  let assembly: PromptAssembly = assemblePrompt(
    {
      ...promptParts,
      skills: skillBodies(wholeSkillIdx),
      specs: specsFor(wholeSkillIdx),
      memory: memoryFor(allPaths),
      diff: input.diff.raw,
    },
    assembleOpts,
  ).assembly;

  const tokensOf = (s: string) => input.countTokens?.(s) ?? Math.ceil(s.length / 4);
  const fileByPath = new Map(input.diff.files.map((f) => [f.path, f]));

  /** One LLM call. `unit` ties it to the group it belongs to (map-reduce: one unit per file). */
  interface Chunk {
    label: string;
    paths: string[];
    diffText: string;
    skillIdx: number[];
    unit: number;
    attempted?: boolean;
    skipped?: boolean;
  }
  /** Skips a unit tolerates before it counts as failed (single-pass groups only). */
  const unitTolerance: number[] = [];
  /** The sub-diff a unit's findings are grounded against (split single-pass runs only). */
  const unitDiffs: UnifiedDiff[] = [];
  let groupSummaryLine: string | undefined;
  const noSkillGroups: string[] = [];

  let chunks: Chunk[];
  if (mode === 'map-reduce') {
    chunks = input.diff.files.map((f, i) => {
      unitTolerance.push(0);
      return {
        label: f.path,
        paths: [f.path],
        diffText: sliceDiff(input.diff, f.path),
        skillIdx: scoped ? skillsForFile(scoped, f.path, match) : [],
        unit: i,
      };
    });
  } else {
    // Single-pass: group files (and deleted files' old paths) by the exact set of skills that apply.
    const groups = scoped
      ? groupBySkillSet([...allPaths, ...deletedPaths], scoped, match)
          .map((g) => ({ paths: g.paths.filter((p) => fileByPath.has(p)), skillIdx: g.skillIdx }))
          .filter((g) => g.paths.length > 0)
      : [];
    if (groups.length <= 1) {
      // Today's exact call: the whole diff in one chunk.
      unitTolerance.push(0);
      chunks = [
        {
          label: 'all files',
          paths: allPaths,
          diffText: input.diff.raw,
          skillIdx: groups[0]?.skillIdx ?? unscopedIdx,
          unit: 0,
        },
      ];
      if (scoped && scoped.length > 0 && chunks[0]!.skillIdx.length === 0) noSkillGroups.push('all files');
    } else {
      chunks = [];
      groups.forEach((g, gi) => {
        const label = `group ${gi + 1}`;
        const text = g.paths.map((p) => sliceDiff(input.diff, p)).join('\n');
        unitDiffs.push({ raw: text, files: g.paths.map((p) => fileByPath.get(p)!) });
        if (tokensOf(text) > maxSinglePass && g.paths.length > 1) {
          // A group too big for one call goes per file (AC-22).
          unitTolerance.push(
            input.maxSkippedChunkFraction != null
              ? Math.max(1, Math.floor(g.paths.length * input.maxSkippedChunkFraction))
              : 0,
          );
          for (const p of g.paths) {
            chunks.push({ label: p, paths: [p], diffText: sliceDiff(input.diff, p), skillIdx: g.skillIdx, unit: gi });
          }
        } else {
          unitTolerance.push(0);
          chunks.push({ label, paths: g.paths, diffText: text, skillIdx: g.skillIdx, unit: gi });
        }
        if (scoped && scoped.length > 0 && g.skillIdx.length === 0) noSkillGroups.push(label);
      });
      const names = (idx: number[]) => (idx.length > 0 ? idx.map((i) => scoped![i]!.name).join(', ') : 'no skills');
      groupSummaryLine = `Grouped ${allPaths.length} files into ${groups.length} review calls by skill set: ${groups
        .map((g, gi) => `group ${gi + 1}: ${g.paths.length} files · ${names(g.skillIdx)}`)
        .join('; ')}`;
    }
  }
  const multiGroup = mode === 'single-pass' && unitDiffs.length > 1;

  const k = (n: number) => Math.round(n / 1000);
  if (reason === 'size-guard') {
    emit(
      'info',
      `Diff is ~${k(diffTokens)}k tokens (> ${k(maxSinglePass)}k) → map-reduce over ${input.diff.files.length} files instead of one pass`,
    );
  } else if (reason === 'oversize-single-file') {
    emit('info', `Warning: diff is ~${k(diffTokens)}k tokens in one file — cannot split; reviewing in one pass`);
  }
  emit(
    'info',
    `LLM call: ${input.model} · routing ${describeRouting(input.routing, input.requireParameters)} · max_tokens=${input.maxOutputTokens ?? 'none'} · deadline ${input.callDeadlineMs != null ? `${Math.round((input.callDeadlineMs / 60_000) * 10) / 10} min` : 'none'}`,
  );
  emit(
    'info',
    mode === 'map-reduce'
      ? `Large diff → map-reduce over ${input.diff.files.length} files`
      : multiGroup
        ? (groupSummaryLine as string)
        : `Reviewing ${input.diff.files.length} changed file(s) in one pass`,
  );
  for (const label of noSkillGroups) {
    emit('info', `${label}: no skill matches its files — reviewed with no skills section`);
  }

  const partials: Review[] = [];
  const partialUnits: number[] = [];
  const usage: UsageTotals = { tokensIn: 0, tokensOut: 0, costUsd: 0, costSource: undefined };
  const raws: string[] = [];
  const skipped: { label: string; reason: string }[] = [];
  const allowed =
    mode === 'map-reduce' && input.maxSkippedChunkFraction != null
      ? Math.max(1, Math.floor(chunks.length * input.maxSkippedChunkFraction))
      : 0;
  const unitSkips = new Map<number, number>();
  const failedUnits = new Map<number, string>();

  for (const chunk of chunks) {
    if (failedUnits.has(chunk.unit)) {
      // A split group already failed: its remaining files are not reviewed, and no call is made.
      chunk.skipped = true;
      skipped.push({ label: chunk.label, reason: failedUnits.get(chunk.unit)! });
      continue;
    }
    // Cancellation checkpoint — stop before the next (expensive) LLM call.
    input.checkCancelled?.();
    // 'map:' prefix only for the map-reduce path (one call per file). A single-pass
    // run with one chunk is the whole diff — don't mislabel it.
    emit(
      'tool',
      mode === 'map-reduce'
        ? `map: reviewing ${chunk.label}`
        : multiGroup
          ? `Reviewing ${chunk.label} (${chunk.paths.length} file(s))`
          : `Reviewing ${chunk.label} in one pass`,
      { file: chunk.label },
    );
    const a = assemblePrompt(
      {
        ...promptParts,
        skills: skillBodies(chunk.skillIdx),
        specs: specsFor(chunk.skillIdx),
        memory: memoryFor(chunk.paths),
        diff: chunk.diffText,
      },
      assembleOpts,
    );
    if (mode === 'single-pass' && chunks.length === 1) assembly = a.assembly;
    const startedAt = Date.now();
    chunk.attempted = true;
    const out = await reviewChunk(input, {
      label: chunk.label,
      messages: a.messages,
      schema: reviewSchema,
      maxRetries,
      canSkip: allowed > 0 || multiGroup,
      emit,
    });
    if (!out.ok) {
      const { err, usage: u } = out;
      chunk.skipped = true;
      skipped.push({ label: chunk.label, reason: err.name });
      if (u) {
        addUsage(usage, {
          tokensIn: u.tokensIn,
          tokensOut: u.tokensOut,
          costUsd: u.costUsd,
          costSource: u.estimated || u.unpriced ? 'estimate' : undefined,
        });
        emit(
          'info',
          `${chunk.label}: counted skipped chunk — ${u.tokensIn} in / ${u.tokensOut} out tokens${u.unpriced ? ' · could not be priced, cost excludes it' : ''}`,
        );
      }
      const how = err instanceof LlmOutputTruncatedError ? ' after retry' : '';
      if (multiGroup) {
        emit('error', `${chunk.label}: skipped — ${err.name}${how} (files not reviewed: ${chunk.paths.join(', ')})`);
        const n = (unitSkips.get(chunk.unit) ?? 0) + 1;
        unitSkips.set(chunk.unit, n);
        if (n > (unitTolerance[chunk.unit] ?? 0)) failedUnits.set(chunk.unit, err.name);
        continue;
      }
      emit('error', `${chunk.label}: skipped — ${err.name}${how} (${skipped.length}/${allowed} allowed)`);
      if (skipped.length > allowed) {
        emit(
          'error',
          `Too many files skipped (${skipped.length} of ${chunks.length}, limit ${allowed}) — failing the run`,
        );
        throw new ReviewChunksSkippedError(
          skipped.length,
          chunks.length,
          `${skipped.length} of ${chunks.length} files could not be reviewed (limit ${allowed}); last: ${err.name}`,
        );
      }
      continue;
    }
    const { res } = out;
    addUsage(usage, {
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      costUsd: res.costUsd,
      costSource: res.costSource,
    });
    raws.push(res.raw);
    partials.push(res.data);
    partialUnits.push(chunk.unit);
    emit(
      'result',
      `${chunk.label}: ${res.data.findings.length} candidate finding(s) · ${res.tokensOut} output tokens · ${Math.round((Date.now() - startedAt) / 1000)} s${res.servedBy ? ` · served by ${res.servedBy}` : ''}`,
    );
  }

  const skippedChunks = chunks.filter((c) => c.skipped);
  const totalFiles = new Set(chunks.flatMap((c) => c.paths)).size;
  const reviewedFiles = new Set(chunks.filter((c) => !c.skipped).flatMap((c) => c.paths)).size;
  const skippedFiles = totalFiles - reviewedFiles;

  if (partials.length === 0) {
    throw new ReviewChunksSkippedError(skipped.length, chunks.length, 'no file could be reviewed');
  }

  const merged = reduceReviews(partials);
  const paths = (() => {
    const all = skippedChunks.flatMap((c) => c.paths);
    const shown = all.slice(0, 10).join(', ');
    return all.length > 10 ? `${shown}, +${all.length - 10} more` : shown;
  })();
  if (skippedChunks.length > 0) {
    emit('result', `Reviewed ${reviewedFiles}/${totalFiles} files — ${skippedFiles} skipped: ${paths}`);
  }
  emit(
    'result',
    `Reduced to ${merged.findings.length} finding(s); model verdict=${merged.verdict}, score=${merged.score}`,
  );

  // SHARED citation-grounding gate (the only post-step; not duplicated per strategy).
  // A single-pass run split into groups grounds each group's findings against that
  // group's own sub-diff; every other run grounds against the whole diff.
  let ground: GroundingResult;
  if (multiGroup) {
    const kept: Finding[] = [];
    const dropped: GroundingResult['dropped'] = [];
    partials.forEach((p, i) => {
      const g = groundFindings(p.findings, unitDiffs[partialUnits[i]!]!);
      kept.push(...g.kept);
      dropped.push(...g.dropped);
    });
    ground = { kept, dropped };
  } else {
    ground = groundFindings(merged.findings, input.diff);
  }
  const grounding = groundingSummary(ground);
  for (const d of ground.dropped) {
    emit('info', `grounding dropped "${d.finding.title}": ${d.reason}`);
  }
  emit('result', `Citation grounding: ${grounding}`);

  // Out-of-scope filter (spec 006 D6) — runs ONLY on grounding survivors, and
  // can only remove a finding, never add one back. No intent ⇒ skipped
  // entirely, so a review without intent is byte-identical to before.
  let finalFindings: Finding[] = ground.kept;
  if (input.intent) {
    const scopedOut = applyScopeFilter(ground.kept as ScopedFinding[]);
    for (const d of scopedOut.dropped) {
      // Distinguishable from a grounding drop (spec 006 S5 gotcha).
      emit('info', `scope-filtered "${d.finding.title}": ${d.reason}`);
    }
    finalFindings = scopedOut.kept;
  }

  // Score, verdict and (multi-call) summary are derived from the findings that
  // SURVIVED grounding (+ scope), not from model output, so they, the findings
  // list, and the deterministic event always agree. A one-call run keeps the
  // model's own summary; several calls would otherwise glue N summaries.
  const baseSummary =
    mode === 'map-reduce' || chunks.length > 1
      ? summarizeFindings(finalFindings, { files: reviewedFiles, chunks: chunks.length - skippedChunks.length })
      : merged.summary;
  return {
    review: {
      ...merged,
      findings: finalFindings,
      score: scoreFromFindings(finalFindings),
      verdict: verdictFromFindings(finalFindings, { partial: skippedChunks.length > 0 }),
      summary:
        skippedChunks.length > 0
          ? `Partial review: ${skippedFiles} of ${totalFiles} files not reviewed (model output cap / invalid output): ${paths}.${baseSummary ? ` ${baseSummary}` : ''}`
          : baseSummary,
    },
    grounding,
    dropped: ground.dropped,
    mode,
    assembly,
    chunks: chunks.map((c) => ({ label: c.label })),
    calls: chunks
      .filter((c) => c.attempted)
      .map((c) => ({ label: c.label, paths: c.paths, skillIds: skillIdsOf(c.skillIdx), ok: !c.skipped })),
    tokensIn: usage.tokensIn,
    tokensOut: usage.tokensOut,
    costUsd: usage.costUsd,
    // No cost ⇒ no provenance to report (a source without a number is noise).
    costSource: usage.costUsd == null ? null : (usage.costSource ?? null),
    raw: raws.join('\n---\n'),
    skipped,
  };
}
