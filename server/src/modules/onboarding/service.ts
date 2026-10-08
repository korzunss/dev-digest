import {
  OnboardingTour,
  type OnboardingTourView,
  type OnboardingUnavailableCause,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { defaultFeatureModel, resolveFeatureModel } from '../settings/feature-models.js';
import type { IndexCoverage } from '../repo-intel/types.js';
import {
  ENDPOINTS_MAX,
  ONBOARDING_LLM_TIMEOUT_MS,
  ONBOARDING_MAX_TOKENS,
  ONBOARDING_SCHEMA_NAME,
  READING_PATH_MAX,
  TOP_FILES_FETCH,
} from './constants.js';
import { collectCloneFacts, emptyFacts } from './facts.js';
import { groundTour, scriptsByDirOf, type GroundingContext } from './grounding.js';
import {
  buildSkeleton,
  classifyGenerationError,
  coverageView,
  deterministicCommands,
  flattenCriticalPaths,
  hasIndex,
  indexAvailability,
  isReadingPathCandidate,
  normalisePath,
  pickReadingPath,
  sanitizeErrorText,
  type GenerationFailureReason,
} from './helpers.js';
import { buildOnboardingMessages } from './prompt.js';
import { OnboardingRepository, type OnboardingRepoRef } from './repository.js';
import {
  OnboardingLlmOutput,
  type CloneFacts,
  type EndpointFact,
  type OnboardingFacts,
} from './types.js';

/**
 * Onboarding Tour — the orchestration half of spec 009.
 *
 *   GET  (`getView`)   repo + clone job + index state -> stored tour, else the
 *                      deterministic skeleton. Never calls the model (AC-12).
 *   POST (`generate`)  guard -> facts -> one `completeStructured` -> grounding
 *                      -> upsert -> view. Never a 500 except an unknown repo.
 *
 * `undefined` means "not this workspace's repo" — the routes map it to 404.
 *
 * The in-flight guard and the last failure are in memory: the API is a single
 * instance (`app.ts` reaps runs on boot on that assumption), and a restart
 * forgetting `last_failure` is acceptable.
 */

type IndexView = OnboardingTourView['index'];
type CloneView = OnboardingTourView['clone'];

interface Failure {
  reason: GenerationFailureReason;
  message: string;
  at: string;
}

/** Minimal pino-compatible logger; only `msg` is read. */
export interface OnboardingLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

/** Everything one view or one generation reads, gathered once. */
interface Collected {
  facts: CloneFacts;
  index: IndexView;
  coverage: Pick<IndexCoverage, 'sourceFilesTotal' | 'edgeCount'>;
  readingRows: OnboardingTourView['tour']['reading_path']['steps'];
  criticalRows: OnboardingTourView['tour']['critical_paths']['rows'];
  endpoints: EndpointFact[];
  currentHead: string | null;
}

const NO_INDEX: IndexView = {
  status: 'failed',
  reason: 'index_failed',
  files_indexed: 0,
  source_files_total: null,
  coverage_partial: false,
  partial_cause: null,
  last_indexed_sha: '',
};

/** Cap on cited task files looked up in the index. */
const CITED_FILES_MAX = 200;

export class OnboardingService {
  private repo: OnboardingRepository;
  private generating = new Set<string>();
  private lastFailure = new Map<string, Failure>();
  /** One entry per repo, replaced whenever `clonePath + sha` changes (X17). */
  private coverageCache = new Map<string, { key: string; coverage: IndexCoverage }>();

  constructor(private container: Container) {
    this.repo = new OnboardingRepository(container.db);
  }

  async getView(workspaceId: string, repoId: string): Promise<OnboardingTourView | undefined> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) return undefined;

    // A GET never 500s on a side read: each one keeps its own typed fallback. Only
    // `getRepo` above may fail (a 404 or a genuine DB outage).
    const model = await resolveFeatureModel(this.container, workspaceId, 'onboarding').catch(() =>
      defaultFeatureModel('onboarding'),
    );
    const clone = await this.cloneView(repo).catch(
      (): CloneView => ({ state: 'none', error: null }),
    );
    const failure = this.lastFailure.get(repoId) ?? null;
    const stored = await this.storedTour(repoId).catch(() => null);

    // A stored tour is returned as-is: only the index view is needed (for `stale`), so the
    // skeleton reads (reading path, critical paths, endpoints, clone facts) are skipped.
    let index: IndexView;
    let tour: OnboardingTourView['tour'];
    if (stored !== null) {
      index = (await this.indexOf(repo).catch(() => ({ index: NO_INDEX }))).index;
      tour = stored;
    } else {
      const collected = await this.collect(repo, clone.state === 'ready').catch(
        (): Collected => ({
          facts: emptyFacts(),
          index: NO_INDEX,
          coverage: { sourceFilesTotal: null, edgeCount: 0 },
          readingRows: [],
          criticalRows: [],
          endpoints: [],
          currentHead: null,
        }),
      );
      index = collected.index;
      tour = buildSkeleton({
        facts: collected.facts,
        index: collected.index,
        coverage: collected.coverage,
        readingRows: collected.readingRows,
        criticalRows: collected.criticalRows,
        currentHead: collected.currentHead,
        failure: failure ? { reason: failure.reason } : null,
      });
    }

    const lastIndexed = index.last_indexed_sha;
    const stale =
      stored !== null &&
      !!stored.built_sha &&
      lastIndexed !== '' &&
      stored.built_sha !== lastIndexed;

    return {
      repo_id: repoId,
      clone,
      index,
      model,
      generating: this.generating.has(repoId),
      stale,
      last_failure: failure,
      stored: stored !== null,
      tour,
    };
  }

  /** Always resolves to the current view (X2): "did not start" shows in `generating` / `clone.state`. */
  async generate(
    workspaceId: string,
    repoId: string,
    log?: OnboardingLogger,
  ): Promise<OnboardingTourView | undefined> {
    // Check-and-add before the first `await` (X5): two presses cannot both pass.
    if (this.generating.has(repoId)) return this.getView(workspaceId, repoId);
    this.generating.add(repoId);

    let found = true;
    try {
      found = await this.runGeneration(workspaceId, repoId, log);
    } finally {
      // By now the call has settled or been aborted by its own signal (X3).
      this.generating.delete(repoId);
    }
    if (!found) return undefined;
    return this.getView(workspaceId, repoId);
  }

  // ---- generation -----------------------------------------------------------

  /** `false` = no such repo. Everything else is absorbed into `lastFailure`. */
  private async runGeneration(
    workspaceId: string,
    repoId: string,
    log?: OnboardingLogger,
  ): Promise<boolean> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) return false;
    if (!repo.clonePath) return true; // AC-20: nothing to read, no model call

    try {
      const { provider, model } = await resolveFeatureModel(
        this.container,
        workspaceId,
        'onboarding',
      );
      const collected = await this.collect(repo, true);
      // Captured before the model call so a re-index during it is seen as stale (X12).
      const builtSha = collected.index.last_indexed_sha || collected.currentHead || null;

      const facts: OnboardingFacts = {
        repoName: repo.fullName,
        clone: collected.facts,
        endpoints: collected.endpoints,
        readingRows: collected.readingRows,
        criticalRows: collected.criticalRows,
        coverage: {
          filesIndexed: collected.index.files_indexed,
          sourceFilesTotal: collected.index.source_files_total,
          partial: collected.index.coverage_partial,
        },
      };
      const messages = await buildOnboardingMessages(facts);

      const llm = await this.container.llm(provider);
      const result = await llm.completeStructured({
        model,
        schema: OnboardingLlmOutput,
        schemaName: ONBOARDING_SCHEMA_NAME,
        messages,
        temperature: 0,
        maxTokens: ONBOARDING_MAX_TOKENS,
        timeoutMs: ONBOARDING_LLM_TIMEOUT_MS,
        maxRetries: 0, // AC-9: one call
        requireParameters: true,
        signal: AbortSignal.timeout(ONBOARDING_LLM_TIMEOUT_MS),
      });

      const cited = [
        ...new Set(result.data.first_tasks.flatMap((t) => t.files.map(normalisePath))),
      ].slice(0, CITED_FILES_MAX);
      const rankRows =
        cited.length > 0 ? await this.container.repoIntel.getFileRank(repoId, cited) : [];

      const skeleton = buildSkeleton({
        facts: collected.facts,
        index: collected.index,
        coverage: collected.coverage,
        readingRows: collected.readingRows,
        criticalRows: collected.criticalRows,
        currentHead: collected.currentHead,
        failure: null,
      });
      const indexAvail = indexAvailability(collected.index, collected.coverage);
      const ctx: GroundingContext = {
        indexed: new Set(rankRows.map((r) => normalisePath(r.path))),
        hasIndex: hasIndex(collected.index),
        indexCause: (indexAvail.cause as OnboardingUnavailableCause | null) ?? null,
        readingRows: skeleton.reading_path.steps,
        criticalRows: skeleton.critical_paths.rows,
        scriptsByDir: scriptsByDirOf(collected.facts.scripts),
        packageDirs: collected.facts.packageDirs,
        envExample: collected.facts.envExample,
        composeFile: collected.facts.composeFile,
        deterministicCommands: deterministicCommands(collected.facts),
      };
      const grounded = groundTour(result.data, ctx);

      const tour: OnboardingTour = {
        source: 'llm',
        built_sha: builtSha,
        generated_at: new Date().toISOString(),
        index_files: collected.index.files_indexed,
        model: { provider, model },
        architecture: {
          ...skeleton.architecture,
          body: grounded.architecture.body,
          diagram: grounded.architecture.diagram,
        },
        critical_paths: { ...skeleton.critical_paths, rows: grounded.criticalRows },
        run_locally: {
          availability: skeleton.run_locally.availability,
          commands: grounded.commands,
        },
        reading_path: { ...skeleton.reading_path, steps: grounded.readingRows },
        first_tasks: grounded.firstTasks,
      };
      await this.repo.upsertTour(repoId, tour);
      this.lastFailure.delete(repoId);
      log?.info(
        `onboarding: ${provider}/${model} tokens ${result.tokensIn}/${result.tokensOut} cost ${result.costUsd ?? 'n/a'}`,
      );
    } catch (err) {
      const reason = classifyGenerationError(err);
      // Same masking as the clone error in `cloneView`: one function for both texts.
      const message = sanitizeErrorText(err instanceof Error ? err.message : String(err));
      // A failed run leaves any stored tour untouched (AC-19).
      this.lastFailure.set(repoId, { reason, message, at: new Date().toISOString() });
      log?.warn(`onboarding: generation failed (${reason})`);
    }
    return true;
  }

  // ---- reads ------------------------------------------------------------------

  private async cloneView(repo: OnboardingRepoRef): Promise<CloneView> {
    if (repo.clonePath) return { state: 'ready', error: null };
    const job = await this.repo.getLatestCloneJob(repo.id).catch(() => undefined);
    if (job?.status === 'queued' || job?.status === 'running') {
      return { state: 'cloning', error: null };
    }
    if (job?.status === 'failed') {
      return { state: 'failed', error: sanitizeErrorText(job.error ?? 'clone failed') };
    }
    return { state: 'none', error: null };
  }

  /** The stored tour, or null when absent or no longer matching the contract. */
  private async storedTour(repoId: string): Promise<OnboardingTour | null> {
    const row = await this.repo.getTour(repoId).catch(() => undefined);
    if (!row) return null;
    const parsed = OnboardingTour.safeParse(row.json);
    if (!parsed.success) return null;
    return { ...parsed.data, generated_at: row.generatedAt.toISOString() };
  }

  private async coverageFor(
    repo: OnboardingRepoRef,
    lastIndexedSha: string,
  ): Promise<IndexCoverage> {
    const key = `${repo.clonePath ?? ''}|${lastIndexedSha}`;
    if (lastIndexedSha !== '' && repo.clonePath) {
      const hit = this.coverageCache.get(repo.id);
      if (hit?.key === key) return hit.coverage;
    }
    const coverage = await this.container.repoIntel.getIndexCoverage(repo.id);
    if (lastIndexedSha !== '' && repo.clonePath) {
      this.coverageCache.set(repo.id, { key, coverage });
    }
    return coverage;
  }

  /** The index view and the coverage figures it was built from. */
  private async indexOf(
    repo: OnboardingRepoRef,
  ): Promise<{ index: IndexView; coverage: IndexCoverage }> {
    const state = await this.container.repoIntel.getIndexState(repo.id);
    const coverage = await this.coverageFor(repo, state.lastIndexedSha);
    return { index: coverageView(state, coverage), coverage };
  }

  /** Facts, index and graph reads for one view or one generation. */
  private async collect(repo: OnboardingRepoRef, cloneReady: boolean): Promise<Collected> {
    const intel = this.container.repoIntel;
    const ref = { owner: repo.owner, name: repo.name };

    const { index, coverage } = await this.indexOf(repo);

    const facts = cloneReady
      ? await collectCloneFacts(this.container.git.clonePathFor(ref))
      : emptyFacts();
    const currentHead = cloneReady
      ? await this.container.git.currentHead(ref).catch(() => null)
      : null;

    const ranked = await intel.getTopFilesByRank(repo.id, TOP_FILES_FETCH);
    const chains = await intel.getCriticalPaths(repo.id);
    const candidates = ranked.filter(isReadingPathCandidate).slice(0, READING_PATH_MAX * 2);
    const statPaths = [...new Set([...candidates, ...chains.flat()].map(normalisePath))];
    const stats = await intel.getFileGraphStats(repo.id, statPaths);
    const endpoints = await intel.getEndpoints(repo.id, ENDPOINTS_MAX);

    return {
      facts,
      index,
      coverage,
      readingRows: pickReadingPath(ranked, stats),
      criticalRows: flattenCriticalPaths(chains, stats),
      endpoints,
      currentHead,
    };
  }
}
