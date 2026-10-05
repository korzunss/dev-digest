import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  LlmConnectionError,
  LlmDeadlineError,
  LlmOutputInvalidError,
} from '@devdigest/reviewer-core';
import {
  buildSkeleton,
  classifyGenerationError,
  coverageView,
  flattenCriticalPaths,
  indexAvailability,
  pickReadingPath,
  sanitizeJobError,
} from '../src/modules/onboarding/helpers.js';
import { emptyFacts } from '../src/modules/onboarding/facts.js';
import { ConfigError } from '../src/platform/errors.js';
import type { FileGraphStat } from '../src/modules/repo-intel/types.js';

/**
 * SPEC-09 acceptance criteria that are pure functions of facts: the reading
 * path and critical paths (AC-5, AC-6), "not available" causes (AC-7, AC-8,
 * AC-37), the failure skeleton (AC-18), the sanitised clone error (AC-21),
 * index-status labelling (AC-22) and the "indexed N of M" coverage (AC-23).
 */

const stat = (path: string, rankPosition: number, importers: number): FileGraphStat => ({
  path,
  rank: 1 / rankPosition,
  rankPosition,
  importers,
});

type IndexState = Parameters<typeof coverageView>[0];
const state = (over: Partial<IndexState> = {}): IndexState => ({
  status: 'full',
  filesIndexed: 10,
  lastIndexedSha: 'abc',
  reason: undefined,
  degradedReason: undefined,
  ...over,
});

function skeletonFor(
  indexOver: Partial<IndexState>,
  coverage: { sourceFilesTotal: number | null; edgeCount: number; partialCause?: null },
  failure: Parameters<typeof buildSkeleton>[0]['failure'] = null,
) {
  const index = coverageView(state(indexOver), { sourceFilesTotal: coverage.sourceFilesTotal, partialCause: null });
  return buildSkeleton({
    facts: { ...emptyFacts(), stack: ['TypeScript'], structure: ['src/'], hasRootManifest: true,
      scripts: [{ dir: '', name: 'dev', command: 'tsx src/a.ts' }] },
    index,
    coverage,
    readingRows: pickReadingPath(['src/a.ts'], [stat('src/a.ts', 1, 3)]),
    criticalRows: flattenCriticalPaths([['src/a.ts', 'src/b.ts']], [stat('src/a.ts', 1, 3)]),
    currentHead: 'headsha',
    failure,
  });
}

describe('Guided reading path (AC-5)', () => {
  // AC-5: descending file rank, excluding tests, config, declaration, migration and generated files
  it('AC-5: keeps rank order and drops tests, config, declaration, migration and generated files', () => {
    const ranked = [
      'src/a.ts',
      'src/a.test.ts',
      'src/a.spec.ts',
      'vitest.config.ts',
      'src/types.d.ts',
      'db/migrations/001_init.ts',
      'src/api.generated.ts',
      'generated/client.ts',
      'test/setup.ts',
      'src/b.ts',
      '.eslintrc.cjs',
      'src/c.ts',
    ];
    const rows = pickReadingPath(ranked, []);
    expect(rows.map((r) => r.path)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });

  // AC-5: at most 10 files
  it('AC-5: lists at most 10 files, the highest ranked ones', () => {
    const ranked = Array.from({ length: 25 }, (_, i) => `src/m${i}.ts`);
    const rows = pickReadingPath(ranked, []);
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.path)).toEqual(ranked.slice(0, 10));
  });

  // AC-5: the skeleton reason is computed from the graph (rank position + importers), not invented
  it('AC-5: each row carries its graph position and importer count, and none is invented', () => {
    const rows = pickReadingPath(['src/a.ts', 'src/b.ts'], [stat('src/b.ts', 2, 14)]);
    const b = rows.find((r) => r.path === 'src/b.ts')!;
    expect(b.rank_position).toBe(2);
    expect(b.importers).toBe(14);
    const a = rows.find((r) => r.path === 'src/a.ts')!;
    expect(a.rank_position).toBeNull();
    expect(a.importers).toBeNull();
  });

  // a path spelled `./src/a.ts` and `src/a.ts` is one file, listed once
  it('AC-5: lists a file once however its path is spelled', () => {
    const rows = pickReadingPath(['./src/a.ts', 'src/a.ts', '\\src\\b.ts'], []);
    expect(rows.map((r) => r.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });
});

describe('Critical paths (AC-6)', () => {
  // AC-6: chains start at the highest-ranked files; at most 6 rows; each row has a path and the chain
  it('AC-6: shows at most 6 distinct files, in chain order, each with the chain it belongs to', () => {
    const chains = [
      ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      ['src/d.ts', 'src/b.ts', 'src/e.ts', 'src/f.ts', 'src/g.ts'],
    ];
    const rows = flattenCriticalPaths(chains, [stat('src/a.ts', 1, 9)]);
    expect(rows.map((r) => r.path)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts', 'src/f.ts']);
    expect(rows).toHaveLength(6);
    expect(rows[0]!.chain).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
    expect(rows[0]!.rank_position).toBe(1);
    expect(rows[0]!.importers).toBe(9);
  });

  // AC-6 + AC-5 exclusions: a test file inside a dependency chain is never a critical path
  it('AC-6: never lists a test or generated file, even when the graph chains through it', () => {
    const rows = flattenCriticalPaths([['src/a.ts', 'src/a.test.ts', 'generated/x.ts', 'src/b.ts']], []);
    expect(rows.map((r) => r.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(rows.flatMap((r) => r.chain)).not.toContain('src/a.test.ts');
  });
});

describe('Not available sections (AC-7, AC-8, AC-37)', () => {
  // AC-7: no import graph because the language is not indexed (non-JS/TS)
  it('AC-7: a repo with no indexable source files is "language not indexed", not an index failure', () => {
    const avail = indexAvailability({ status: 'full', reason: null }, { sourceFilesTotal: 0, edgeCount: 0 });
    expect(avail).toMatchObject({ available: false, cause: 'language_not_indexed' });
  });

  // AC-7: the rest of the tour is still shown from the deterministic facts
  it('AC-7: reading path and critical paths are unavailable, while architecture and run commands remain', () => {
    const tour = skeletonFor({ status: 'full', filesIndexed: 0 }, { sourceFilesTotal: 0, edgeCount: 0 });
    expect(tour.reading_path.availability).toMatchObject({ available: false, cause: 'language_not_indexed' });
    expect(tour.critical_paths.availability).toMatchObject({ available: false, cause: 'language_not_indexed' });
    expect(tour.reading_path.steps).toEqual([]);
    expect(tour.critical_paths.rows).toEqual([]);
    expect(tour.architecture.availability.available).toBe(true);
    expect(tour.architecture.stack).toEqual(['TypeScript']);
    expect(tour.architecture.structure).toEqual(['src/']);
    expect(tour.run_locally.availability.available).toBe(true);
    expect(tour.run_locally.commands.length).toBeGreaterThan(0);
  });

  // AC-8: an empty graph for another reason names the index status and reason
  it('AC-8: a failed index shows both sections unavailable with the index reason', () => {
    const tour = skeletonFor(
      { status: 'failed', reason: 'parser crashed', filesIndexed: 0 },
      { sourceFilesTotal: 12, edgeCount: 0 },
    );
    for (const section of [tour.reading_path.availability, tour.critical_paths.availability]) {
      expect(section).toMatchObject({ available: false, cause: 'index_failed', reason: 'parser crashed' });
    }
  });

  // AC-8: "no edges" is also an index problem, and still says why
  it('AC-8: a full index with an empty import graph is unavailable with a non-empty reason', () => {
    const avail = indexAvailability({ status: 'full', reason: null }, { sourceFilesTotal: 12, edgeCount: 0 });
    expect(avail.available).toBe(false);
    expect(avail.cause).toBe('index_failed');
    expect(avail.reason).toBeTruthy();
  });

  // AC-22: a partial index with a graph is still usable, so its sections are shown
  it('AC-22: a partial index that has a graph keeps both sections available', () => {
    const avail = indexAvailability({ status: 'partial', reason: 'file cap' }, { sourceFilesTotal: 100, edgeCount: 40 });
    expect(avail.available).toBe(true);
  });

  // AC-37: every "not available" section names one of the three causes
  it('AC-37: language-not-indexed, index-failed and model-failed are each named as a cause', () => {
    const lang = skeletonFor({ filesIndexed: 0 }, { sourceFilesTotal: 0, edgeCount: 0 });
    const idx = skeletonFor({ status: 'degraded', degradedReason: 'index_failed' }, { sourceFilesTotal: 5, edgeCount: 0 });
    const model = skeletonFor({}, { sourceFilesTotal: 5, edgeCount: 3 }, { reason: 'timeout' });
    expect(lang.reading_path.availability.cause).toBe('language_not_indexed');
    expect(idx.critical_paths.availability.cause).toBe('index_failed');
    expect(model.first_tasks.availability.cause).toBe('model_failed');
  });
});

describe('Failure skeleton (AC-18)', () => {
  // AC-18: first tasks are "not available" and the status names the failure reason
  it('AC-18: a failed model call leaves first tasks unavailable, naming the failure reason', () => {
    const tour = skeletonFor({}, { sourceFilesTotal: 5, edgeCount: 3 }, { reason: 'invalid_output' });
    expect(tour.source).toBe('skeleton');
    expect(tour.first_tasks.availability).toMatchObject({ available: false, cause: 'model_failed', reason: 'invalid_output' });
    expect(tour.first_tasks.tasks).toEqual([]);
    // the deterministic parts survive the failure
    expect(tour.reading_path.steps.length).toBeGreaterThan(0);
    expect(tour.run_locally.commands.length).toBeGreaterThan(0);
  });

  // AC-18: key failure kinds are mapped to the closed set of reasons
  it.each([
    ['no key', new ConfigError('OPENROUTER_API_KEY is not configured'), 'no_key'],
    ['no model (404)', Object.assign(new Error('not found'), { status: 404 }), 'no_model'],
    ['model not found message', new Error('The model xyz does not exist'), 'no_model'],
    ['deadline', new LlmDeadlineError('m', 90_000), 'timeout'],
    ['connection', new LlmConnectionError('m', true), 'timeout'],
    ['abort', new DOMException('aborted', 'AbortError'), 'timeout'],
    ['timeout signal', new DOMException('timed out', 'TimeoutError'), 'timeout'],
    ['invalid output', new LlmOutputInvalidError('m', 'onboarding_tour', 1), 'invalid_output'],
    ['zod', new ZodError([]), 'invalid_output'],
    ['anything else', new Error('upstream exploded'), 'provider_error'],
  ])('AC-18: %s is reported as %s', (_name, err, reason) => {
    expect(classifyGenerationError(err)).toBe(reason);
  });
});

describe('Clone error text (AC-21)', () => {
  // AC-21: the failure reason is shown, never the forge token embedded in the clone URL
  it('AC-21: removes URL credentials and forge tokens from a clone error', () => {
    const out = sanitizeJobError(
      'fatal: unable to access https://x-access-token:ghp_abcDEF123456@github.com/acme/api.git/: 403',
    );
    expect(out).not.toContain('ghp_abcDEF123456');
    expect(out).not.toContain('x-access-token');
    expect(out).toContain('github.com/acme/api.git');
  });

  // AC-21: tokens that are not in a URL are masked too
  it.each(['ghp_', 'gho_', 'ghs_', 'github_pat_', 'glpat-'])('AC-21: masks a bare %s token', (prefix) => {
    const out = sanitizeJobError(`clone failed with token ${prefix}Zz09_-secretvalue ok`);
    expect(out).not.toContain('secretvalue');
  });

  // AC-21: only the first line is kept, so a stack trace or a later line cannot carry a secret out
  it('AC-21: keeps the first line only and caps the length', () => {
    expect(sanitizeJobError('first line\nsecond line with ghp_leak123')).toBe('first line');
    expect(sanitizeJobError('x'.repeat(5000)).length).toBeLessThanOrEqual(300);
  });
});

describe('Index status and coverage (AC-22, AC-23)', () => {
  // AC-22: a partial, degraded or failed index is labelled with its status and reason
  it.each([
    [{ status: 'partial', reason: 'file cap reached' }, 'partial', 'file cap reached'],
    [{ status: 'degraded', degradedReason: 'index_failed' }, 'degraded', 'index_failed'],
    [{ status: 'failed', reason: 'boom', degradedReason: 'index_failed' }, 'failed', 'boom'],
  ] as const)('AC-22: %j is shown as %s with its reason', (over, status, reason) => {
    const view = coverageView(state({ ...over }), { sourceFilesTotal: 10, partialCause: null });
    expect(view.status).toBe(status);
    expect(view.reason).toBe(reason);
  });

  // AC-23: "indexed N of M source files · partial" when the index covers fewer files than the repo holds
  it('AC-23: reports N of M and partial when fewer source files are indexed than exist', () => {
    const view = coverageView(state({ status: 'partial', filesIndexed: 5 }), {
      sourceFilesTotal: 12,
      partialCause: 'file_cap',
    });
    expect(view.files_indexed).toBe(5);
    expect(view.source_files_total).toBe(12);
    expect(view.coverage_partial).toBe(true);
    expect(view.partial_cause).toBe('file_cap');
  });

  // AC-23: a complete index is not "partial"
  it('AC-23: a fully covered index is not partial', () => {
    const view = coverageView(state({ filesIndexed: 12 }), { sourceFilesTotal: 12, partialCause: null });
    expect(view.coverage_partial).toBe(false);
  });

  // AC-23: parse/graph errors are partial even when every file was seen, and the cause is exposed
  it('AC-23: parse errors make the index partial and name their cause', () => {
    const view = coverageView(state({ filesIndexed: 12 }), { sourceFilesTotal: 12, partialCause: 'parse_errors' });
    expect(view.coverage_partial).toBe(true);
    expect(view.partial_cause).toBe('parse_errors');
  });

  // AC-23: M counts source files of the indexed languages only; the index can never claim more than M
  it('AC-23: never reports more files indexed than source files exist', () => {
    const view = coverageView(state({ filesIndexed: 30 }), { sourceFilesTotal: 12, partialCause: null });
    expect(view.files_indexed).toBeLessThanOrEqual(12);
  });

  // AC-7 wording instead of N of M: a repo with no indexable source has no coverage figure
  it('AC-23: a repo with zero indexable source files shows no "N of M" partial claim', () => {
    const view = coverageView(state({ filesIndexed: 0 }), { sourceFilesTotal: 0, partialCause: null });
    expect(view.coverage_partial).toBe(false);
  });
});
