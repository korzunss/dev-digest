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
import { assemblePrompt } from '../prompt.js';
import { groundFindings, groundingSummary } from '../grounding.js';
import { reduceReviews, scoreFromFindings, sliceDiff } from './reduce.js';
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
  /** The PR's unified diff (already parsed; hunks carry new-side line numbers). */
  diff: UnifiedDiff;
  /** Injected LLM provider (OpenRouter in CI, OpenAI/Anthropic in the studio). */
  llm: LLMProvider;
  /** 'auto' (default) picks single-pass unless the diff is large + multi-file. */
  strategy?: ReviewStrategy;
  /** Resolved skill bodies (NOT slugs). */
  skills?: string[];
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
  /** Project-context spec chunks (untrusted; delimiter-wrapped downstream). */
  specs?: string[];
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
  /** The reduced, GROUNDED review (findings that survived the citation gate). */
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

  const promptParts = {
    system: input.systemPrompt,
    skills: input.skills,
    specs: input.specs,
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

  // Whole-diff assembly is the trace default; overwritten below for single-pass.
  let assembly: PromptAssembly = assemblePrompt(
    { ...promptParts, memory: memoryFor(allPaths), diff: input.diff.raw },
    assembleOpts,
  ).assembly;

  const chunks =
    mode === 'map-reduce'
      ? input.diff.files.map((f) => ({
          label: f.path,
          paths: [f.path],
          diffText: sliceDiff(input.diff, f.path),
        }))
      : [{ label: 'all files', paths: allPaths, diffText: input.diff.raw }];

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
      : `Reviewing ${input.diff.files.length} changed file(s) in one pass`,
  );

  const partials: Review[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd: number | null = 0;
  let costSource: CostSource | undefined;
  const raws: string[] = [];
  const skipped: { label: string; reason: string }[] = [];
  const allowed =
    mode === 'map-reduce' && input.maxSkippedChunkFraction != null
      ? Math.max(1, Math.floor(chunks.length * input.maxSkippedChunkFraction))
      : 0;

  for (const chunk of chunks) {
    // Cancellation checkpoint — stop before the next (expensive) LLM call.
    input.checkCancelled?.();
    // 'map:' prefix only for the map-reduce path (one call per file). In
    // single-pass there is exactly one chunk (the whole diff) — don't mislabel it.
    emit(
      'tool',
      mode === 'map-reduce' ? `map: reviewing ${chunk.label}` : `Reviewing ${chunk.label} in one pass`,
      { file: chunk.label },
    );
    const a = assemblePrompt(
      { ...promptParts, memory: memoryFor(chunk.paths), diff: chunk.diffText },
      assembleOpts,
    );
    if (mode === 'single-pass') assembly = a.assembly;
    const startedAt = Date.now();
    // A box, not a `let`: a closure assignment to a `let` is invisible to narrowing in the catch below.
    const failed: { usage?: FailedCallUsage } = {};
    let res: Awaited<ReturnType<typeof callWithDeadline<Review>>>;
    try {
      res = await callWithDeadline<Review>({
        llm: input.llm,
        request: {
          model: input.model,
          schema: reviewSchema,
          schemaName: 'Review',
          messages: a.messages,
          maxRetries,
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
        label: chunk.label,
        emit,
        onFinalFailure: (u) => {
          failed.usage = u;
        },
      });
    } catch (err) {
      if (allowed === 0 || !(err instanceof LlmOutputTruncatedError || err instanceof LlmOutputInvalidError)) {
        throw err;
      }
      skipped.push({ label: chunk.label, reason: err.name });
      const u = failed.usage;
      if (u) {
        tokensIn += u.tokensIn;
        tokensOut += u.tokensOut;
        costUsd = costUsd == null ? null : costUsd + u.costUsd;
        if (u.estimated || u.unpriced) costSource = 'estimate';
        emit(
          'info',
          `${chunk.label}: counted skipped chunk — ${u.tokensIn} in / ${u.tokensOut} out tokens${u.unpriced ? ' · could not be priced, cost excludes it' : ''}`,
        );
      }
      const how = err instanceof LlmOutputTruncatedError ? ' after retry' : '';
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
    tokensIn += res.tokensIn;
    tokensOut += res.tokensOut;
    costUsd = costUsd == null || res.costUsd == null ? null : costUsd + res.costUsd;
    // Worst-wins: one estimated chunk makes the whole run an estimate.
    if (res.costSource === 'estimate') costSource = 'estimate';
    else if (res.costSource === 'api' && costSource !== 'estimate') costSource = 'api';
    raws.push(res.raw);
    partials.push(res.data);
    emit(
      'result',
      `${chunk.label}: ${res.data.findings.length} candidate finding(s) · ${res.tokensOut} output tokens · ${Math.round((Date.now() - startedAt) / 1000)} s${res.servedBy ? ` · served by ${res.servedBy}` : ''}`,
    );
  }

  if (partials.length === 0) {
    throw new ReviewChunksSkippedError(skipped.length, chunks.length, 'no file could be reviewed');
  }

  const merged = reduceReviews(partials);
  const paths = (() => {
    const shown = skipped.slice(0, 10).map((x) => x.label).join(', ');
    return skipped.length > 10 ? `${shown}, +${skipped.length - 10} more` : shown;
  })();
  if (skipped.length > 0) {
    emit(
      'result',
      `Reviewed ${chunks.length - skipped.length}/${chunks.length} files — ${skipped.length} skipped: ${paths}`,
    );
  }
  emit(
    'result',
    `Reduced to ${merged.findings.length} finding(s); verdict=${merged.verdict}, score=${merged.score}`,
  );

  // SHARED citation-grounding gate (the only post-step; not duplicated per strategy).
  const ground = groundFindings(merged.findings, input.diff);
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
    const scoped = applyScopeFilter(ground.kept as ScopedFinding[]);
    for (const d of scoped.dropped) {
      // Distinguishable from a grounding drop (spec 006 S5 gotcha).
      emit('info', `scope-filtered "${d.finding.title}": ${d.reason}`);
    }
    finalFindings = scoped.kept;
  }

  // Score is derived from the findings that SURVIVED grounding (+ scope) (not
  // the model's self-reported number) so the score, the findings list, and the
  // deterministic event always agree.
  return {
    review: {
      ...merged,
      findings: finalFindings,
      score: scoreFromFindings(finalFindings),
      ...(skipped.length > 0
        ? {
            summary: `Partial review: ${skipped.length} of ${chunks.length} files not reviewed (model output cap / invalid output): ${paths}.${merged.summary ? ` ${merged.summary}` : ''}`,
          }
        : {}),
    },
    grounding,
    dropped: ground.dropped,
    mode,
    assembly,
    chunks: chunks.map((c) => ({ label: c.label })),
    tokensIn,
    tokensOut,
    costUsd,
    // No cost ⇒ no provenance to report (a source without a number is noise).
    costSource: costUsd == null ? null : (costSource ?? null),
    raw: raws.join('\n---\n'),
    skipped,
  };
}
