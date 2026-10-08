/**
 * Onboarding — pure helpers. No I/O.
 *
 * Skeleton "reasons" are DATA (rank position, importer count, chain): the client
 * words them through i18n, so nothing here produces user-facing prose.
 */
import { ZodError } from 'zod';
import {
  LlmConnectionError,
  LlmDeadlineError,
  LlmOutputInvalidError,
  LlmOutputTruncatedError,
} from '@devdigest/reviewer-core';
import type {
  OnboardingAvailability,
  OnboardingCommand,
  OnboardingFileRow,
  OnboardingTour,
  OnboardingTourView,
} from '@devdigest/shared';
import { ConfigError, ExternalServiceError } from '../../platform/errors.js';
import type { FileGraphStat, IndexCoverage, IndexState } from '../repo-intel/types.js';
import {
  CRITICAL_ROWS_MAX,
  ERROR_TEXT_MAX,
  READING_PATH_MAX,
} from './constants.js';
import type { CloneFacts } from './types.js';

type IndexView = OnboardingTourView['index'];
export type GenerationFailureReason = NonNullable<OnboardingTourView['last_failure']>['reason'];

// ---- paths ------------------------------------------------------------------

/** `\` -> `/`, strip leading `./` and `/` (X8). */
export function normalisePath(p: string): string {
  let out = p.replace(/\\/g, '/');
  for (;;) {
    if (out.startsWith('./')) out = out.slice(2);
    else if (out.startsWith('/')) out = out.slice(1);
    else break;
  }
  return out;
}

const EXCLUDED_SEGMENTS = new Set([
  'test',
  'tests',
  '__tests__',
  '__mocks__',
  '__fixtures__',
  'migrations',
  'dist',
  'build',
  'out',
  '.next',
  'coverage',
  'generated',
]);

const EXCLUDED_NAME_PATTERNS: RegExp[] = [
  /\.test\./,
  /\.spec\./,
  /\.d\.ts$/,
  /\.config\./,
  /^vitest\./,
  /^jest\./,
  /eslint/i,
  /prettier/i,
  /^tsconfig/,
  /\.generated\./,
  /\.gen\./,
  /\.min\.js$/,
];

/** D4: is this file worth reading first? Excludes tests, config, generated and build output. */
export function isReadingPathCandidate(rawPath: string): boolean {
  const p = normalisePath(rawPath);
  if (p === '') return false;
  const segments = p.split('/');
  const name = segments[segments.length - 1] ?? '';
  if (segments.slice(0, -1).some((s) => EXCLUDED_SEGMENTS.has(s))) return false;
  if (EXCLUDED_SEGMENTS.has(name)) return false;
  return !EXCLUDED_NAME_PATTERNS.some((re) => re.test(name));
}

function rowFor(
  path: string,
  stats: Map<string, FileGraphStat>,
  chain: string[],
): OnboardingFileRow {
  const s = stats.get(path);
  return {
    path,
    reason: null,
    rank_position: s?.rankPosition ?? null,
    importers: s?.importers ?? null,
    chain,
  };
}

function statsByPath(stats: FileGraphStat[]): Map<string, FileGraphStat> {
  return new Map(stats.map((s) => [normalisePath(s.path), s]));
}

/** <= READING_PATH_MAX candidate rows in rank order, `reason: null` (the model attaches text later). */
export function pickReadingPath(ranked: string[], stats: FileGraphStat[]): OnboardingFileRow[] {
  const byPath = statsByPath(stats);
  const seen = new Set<string>();
  const rows: OnboardingFileRow[] = [];
  for (const raw of ranked) {
    const p = normalisePath(raw);
    if (seen.has(p) || !isReadingPathCandidate(p)) continue;
    seen.add(p);
    rows.push(rowFor(p, byPath, []));
    if (rows.length >= READING_PATH_MAX) break;
  }
  return rows;
}

/** <= CRITICAL_ROWS_MAX distinct candidate files in chain order, each with its (junk-free) chain. */
export function flattenCriticalPaths(
  chains: string[][],
  stats: FileGraphStat[],
): OnboardingFileRow[] {
  const byPath = statsByPath(stats);
  const seen = new Set<string>();
  const rows: OnboardingFileRow[] = [];
  for (const rawChain of chains) {
    const chain = rawChain.map(normalisePath).filter(isReadingPathCandidate);
    for (const p of chain) {
      if (seen.has(p)) continue;
      seen.add(p);
      rows.push(rowFor(p, byPath, chain));
      if (rows.length >= CRITICAL_ROWS_MAX) return rows;
    }
  }
  return rows;
}

// ---- index / coverage ---------------------------------------------------------

/** The graph exists iff at least one edge was recorded (Y8). */
export function hasGraph(coverage: Pick<IndexCoverage, 'edgeCount'>): boolean {
  return coverage.edgeCount > 0;
}

export function hasIndex(index: Pick<IndexView, 'files_indexed'>): boolean {
  return index.files_indexed > 0;
}

const AVAILABLE: OnboardingAvailability = { available: true, cause: null, reason: null };

/** Availability of the index-derived sections (critical paths, reading path). AC-7, AC-8. */
export function indexAvailability(
  index: Pick<IndexView, 'status' | 'reason'>,
  coverage: Pick<IndexCoverage, 'sourceFilesTotal' | 'edgeCount'>,
): OnboardingAvailability {
  if (coverage.sourceFilesTotal === 0) {
    return { available: false, cause: 'language_not_indexed', reason: null };
  }
  if (index.status === 'degraded' || index.status === 'failed' || !hasGraph(coverage)) {
    return { available: false, cause: 'index_failed', reason: index.reason ?? 'no_edges' };
  }
  return { ...AVAILABLE };
}

/** The `index` block of the view from the stored index state and the coverage read (X7). */
export function coverageView(
  state: Pick<IndexState, 'status' | 'filesIndexed' | 'lastIndexedSha' | 'reason' | 'degradedReason'>,
  coverage: Pick<IndexCoverage, 'sourceFilesTotal' | 'partialCause'>,
): IndexView {
  const total = coverage.sourceFilesTotal;
  const filesIndexed = total === null ? state.filesIndexed : Math.min(state.filesIndexed, total);
  const partial =
    total !== null && total > 0 && (filesIndexed < total || coverage.partialCause !== null);
  return {
    status: state.status,
    reason: state.reason ?? state.degradedReason ?? null,
    files_indexed: filesIndexed,
    source_files_total: total,
    coverage_partial: partial,
    partial_cause: coverage.partialCause,
    last_indexed_sha: state.lastIndexedSha,
  };
}

// ---- commands -----------------------------------------------------------------

/** Runnable setup commands built from facts alone: install, env copy, compose, dev/start per package. */
export function deterministicCommands(facts: CloneFacts): OnboardingCommand[] {
  const pm = facts.packageManager;
  const out: OnboardingCommand[] = [];
  const add = (command: string) => out.push({ command, note: null });

  if (facts.hasRootManifest || facts.packageDirs.length > 0) add(`${pm} install`);
  if (facts.envExample) add(`cp ${facts.envExample} .env`);
  if (facts.composeFile) add('docker compose up -d');

  for (const dir of ['', ...facts.packageDirs]) {
    const names = new Set(facts.scripts.filter((s) => s.dir === dir).map((s) => s.name));
    const script = names.has('dev') ? 'dev' : names.has('start') ? 'start' : null;
    if (!script) continue;
    add(dir === '' ? `${pm} run ${script}` : `cd ${dir} && ${pm} run ${script}`);
  }
  return out;
}

// ---- skeleton -------------------------------------------------------------------

export interface SkeletonInput {
  facts: CloneFacts;
  index: IndexView;
  coverage: Pick<IndexCoverage, 'sourceFilesTotal' | 'edgeCount'>;
  readingRows: OnboardingFileRow[];
  criticalRows: OnboardingFileRow[];
  /** HEAD of the clone, used only when the index has no sha (X9). */
  currentHead: string | null;
  /** Set when a generation failed; first tasks then say why (AC-18). */
  failure: { reason: GenerationFailureReason } | null;
}

/** The deterministic tour shown before (or without) a model run. */
export function buildSkeleton(input: SkeletonInput): OnboardingTour {
  const { facts, index, coverage } = input;
  const avail = indexAvailability(index, coverage);
  return {
    source: 'skeleton',
    built_sha: index.last_indexed_sha || input.currentHead || null,
    generated_at: null,
    index_files: index.files_indexed,
    model: null,
    architecture: {
      availability: { ...AVAILABLE },
      body: '',
      diagram: null,
      stack: facts.stack,
      structure: facts.structure,
    },
    critical_paths: { availability: avail, rows: avail.available ? input.criticalRows : [] },
    run_locally: { availability: { ...AVAILABLE }, commands: deterministicCommands(facts) },
    reading_path: { availability: avail, steps: avail.available ? input.readingRows : [] },
    first_tasks: {
      availability: input.failure
        ? { available: false, cause: 'model_failed', reason: input.failure.reason }
        : { available: false, cause: null, reason: null },
      tasks: [],
    },
  };
}

// ---- errors ---------------------------------------------------------------------

const TOKEN_RE = /(?:ghp_|gho_|ghs_|github_pat_|glpat-)[A-Za-z0-9_-]+/g;
const USERINFO_RE = /\/\/[^/\s@]*@/g;
/** Provider keys: `sk-ant-…`, `sk-or-…`, `sk-…` (16+ chars of the key alphabet). */
const API_KEY_RE = /\bsk-[A-Za-z0-9_-]{16,}/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const HEX_RUN_RE = /\b[A-Fa-f0-9]{32,}\b/g;
/** base64 / base64url run: long enough that ordinary words and short paths never match. */
const BASE64_RUN_RE = /[A-Za-z0-9+/_-]{40,}={0,2}/g;

/**
 * A stored/shown error text: first line, no URL userinfo, no forge tokens, no
 * provider keys, bearer tokens or long secret-looking runs, capped (X6).
 * One function for both clone errors and LLM failures.
 */
export function sanitizeErrorText(text: string): string {
  const first = text.split(/\r?\n/)[0] ?? '';
  return first
    .replace(USERINFO_RE, '//***@')
    .replace(TOKEN_RE, '***')
    .replace(BEARER_RE, '***')
    .replace(API_KEY_RE, '***')
    .replace(HEX_RUN_RE, '***')
    .replace(BASE64_RUN_RE, '***')
    .slice(0, ERROR_TEXT_MAX);
}

/** Kept for existing callers. */
export const sanitizeJobError = sanitizeErrorText;

function errName(err: unknown): string {
  return typeof err === 'object' && err !== null && 'name' in err ? String(err.name) : '';
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : '';
}

const MODEL_NOT_FOUND_RE = /model.*(not found|does not exist|not available)|no such model|not a valid model/i;

/** Map a generation failure to the closed set the view exposes (X11). */
export function classifyGenerationError(err: unknown): GenerationFailureReason {
  if (err instanceof ConfigError) return 'no_key';
  const status =
    typeof err === 'object' && err !== null && 'status' in err ? err.status : undefined;
  if (status === 404 || MODEL_NOT_FOUND_RE.test(errMessage(err))) return 'no_model';
  if (
    err instanceof LlmDeadlineError ||
    err instanceof LlmConnectionError ||
    errName(err) === 'TimeoutError' ||
    errName(err) === 'AbortError'
  ) {
    return 'timeout';
  }
  if (
    err instanceof LlmOutputInvalidError ||
    err instanceof LlmOutputTruncatedError ||
    err instanceof ZodError ||
    (err instanceof ExternalServiceError && /schema validation/.test(err.message))
  ) {
    return 'invalid_output';
  }
  return 'provider_error';
}
