import {
  classifyIntent,
  fileSummariesFromDiff,
  type FileSummary,
  type IntentPromptDoc,
  type IntentPromptIssue,
  type IntentUnavailableSource,
} from '@devdigest/reviewer-core';
import type {
  CostSource,
  FeatureModelChoice,
  FeatureModelId,
  ForgeClient,
  ForgeProvider,
  GitClient,
  Intent,
  IntentConfidence,
  IntentSource,
  LLMProvider,
  MissingContext,
  PrIntentRecord,
  PrIntentResponse,
  PromptSection,
  RepoRef,
  UnifiedDiff,
} from '@devdigest/shared';
import type { PullRow } from '../../db/rows.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import { toRepoRef, forgeHostOf } from '../../platform/forge-resolve.js';
import { INTENT_REVIEW_BUDGET_MS, MAX_DOC_BYTES, SOURCE_TIMEOUT_MS } from './constants.js';
import { capConfidence, descriptionHash, extractIntentLinks, headersFromPatch, staleness } from './helpers.js';
import { IntentRepository, type IntentUpsert, type PrIntentRow, type RepoRow } from './repository.js';

/**
 * Narrow view of `IntentRepository` the service depends on (D10-A) — kept as
 * an alias rather than a hand-picked method list so a new repository method
 * doesn't need a second edit here.
 */
export type IntentStore = Pick<IntentRepository, keyof IntentRepository>;

/**
 * Everything `IntentService` needs from the outside world, injected by the
 * DI composition root — the only place allowed to know both this service and
 * the DI container. Keeping the constructor off the container breaks the
 * container-vs-service dependency cycle (F2/D10-A) and makes the service
 * testable from fakes, with no DB.
 */
export interface IntentServiceDeps {
  repo: IntentStore;
  git: Pick<GitClient, 'diff' | 'fetchPullHead' | 'readFileAt'>;
  forge: (ref: RepoRef) => Promise<Pick<ForgeClient, 'getIssue'>>;
  llm: (id: FeatureModelChoice['provider']) => Promise<LLMProvider>;
  tokenizer: { count(text: string): number };
  resolveModel: (workspaceId: string, id: FeatureModelId) => Promise<FeatureModelChoice>;
  /** Overall budget for `ensureForReview` (S16d); defaults to `INTENT_REVIEW_BUDGET_MS`. */
  reviewBudgetMs?: number;
}

/** Human-readable run-log line (matches `RunLogger.info`'s shape) plus the
 * structured pino logger — a classification run reports through both, never
 * with body/doc/issue/diff text or a raw URL in either. */
export interface ClassifyOptions {
  diff?: UnifiedDiff;
  logger?: {
    info: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
  };
  onLog?: (msg: string, data?: unknown) => void;
}

/** Classify a fetch/read failure into one of three reason CLASSES — never
 * `err.message`, which could carry a token, a path or a server response body. */
function classifyFailure(err: unknown): 'not_found' | 'unreachable' | 'too_large' {
  const status =
    (err as { status?: number } | undefined)?.status ??
    (err as { statusCode?: number } | undefined)?.statusCode;
  if (status === 404) return 'not_found';
  const message = err instanceof Error ? err.message : '';
  if (/too large|maximum size/i.test(message)) return 'too_large';
  return 'unreachable';
}

/**
 * PR intent classification + persistence (spec 006 G4). Orchestration only —
 * every external call goes through the injected `IntentServiceDeps` ports
 * (forge, git, llm, tokenizer); `IntentRepository` is the only thing touching
 * `pr_intent`.
 *
 * `classify` propagates provider errors (surfaced by routes as
 * ConfigError/ExternalServiceError, e.g. a missing OpenRouter key on manual
 * Re-classify). `ensureForReview` never throws — a classification failure
 * during a review must not fail the run (spec 006 AC12).
 */
export class IntentService {
  constructor(private deps: IntentServiceDeps) {}

  async get(workspaceId: string, prId: string): Promise<PrIntentResponse | undefined> {
    const found = await this.deps.repo.getPull(workspaceId, prId);
    if (!found) return undefined;
    const row = await this.deps.repo.get(prId);
    return {
      intent: row ? this.toRecord(row, found.pull) : null,
      pr_head_sha: found.pull.headSha,
    };
  }

  /** Manual `POST /pulls/:id/intent/classify` (D4-A) — always recomputes. */
  async classify(
    workspaceId: string,
    prId: string,
    opts: ClassifyOptions = {},
  ): Promise<PrIntentRecord | undefined> {
    const found = await this.deps.repo.getPull(workspaceId, prId);
    if (!found) return undefined;
    return this.runClassification(found.pull, found.repo, opts);
  }

  /**
   * Review pre-work (D4-A): classify only when there is no record yet or the
   * stored one is stale against `pull`'s CURRENT head/title/body. Never
   * throws — a failure here means the review proceeds without intent.
   *
   * Fix R1 / S16d: the whole resolution (staleness check + `runClassification`)
   * is bounded by `deps.reviewBudgetMs ?? INTENT_REVIEW_BUDGET_MS`. On expiry
   * we own and abort an `AbortController` whose signal we passed into
   * `runClassification` (D14-A): every checkpoint inside it throws on the next
   * await, so nothing fetched, computed or logged after the timeout is ever
   * persisted — no late `pr_intent` upsert, no late "intent: classified" log.
   * The manual `classify` route is not bounded by this and gets no signal.
   */
  async ensureForReview(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    diff: UnifiedDiff,
    opts: Omit<ClassifyOptions, 'diff'> = {},
  ): Promise<Intent | undefined> {
    const ac = new AbortController();
    const resolution = (async (): Promise<Intent | undefined> => {
      const existing = await this.deps.repo.get(pull.id);
      if (existing) {
        const { stale, staleReason } = staleness(existing, pull);
        if (!stale) {
          return { intent: existing.intent, in_scope: existing.inScope, out_of_scope: existing.outOfScope };
        }
        opts.onLog?.(`PR intent stale (${staleReason}) — re-classifying`);
      } else {
        opts.onLog?.('No PR intent yet — classifying');
      }
      const record = await this.runClassification(pull, repo, { ...opts, diff }, ac.signal);
      return { intent: record.intent, in_scope: record.in_scope, out_of_scope: record.out_of_scope };
    })();
    resolution.catch(() => {
      // The abort rejection (or any other rejection once we've already
      // stopped waiting below) must not surface as an unhandled rejection —
      // the result is simply discarded.
    });

    try {
      return await withTimeout(resolution, this.deps.reviewBudgetMs ?? INTENT_REVIEW_BUDGET_MS);
    } catch (err) {
      if (err instanceof TimeoutError) {
        // Cancel the in-flight classification BEFORE logging, so a
        // classification that raced past its last checkpoint can never win
        // against the "unavailable" log line below.
        ac.abort(err);
      }
      const warnData =
        err instanceof TimeoutError
          ? { prId: pull.id, workspaceId, reason: 'timeout' as const }
          : { prId: pull.id, workspaceId };
      opts.logger?.warn(warnData, 'intent classification failed');
      opts.onLog?.('intent unavailable — reviewing without it');
      return undefined;
    }
  }

  private log(opts: ClassifyOptions, msg: string, data: Record<string, unknown>): void {
    opts.logger?.info(data, msg);
    opts.onLog?.(msg, data);
  }

  private async fileSummaries(pull: PullRow, repo: RepoRow, diff?: UnifiedDiff): Promise<FileSummary[]> {
    if (diff) return fileSummariesFromDiff(diff);
    const prFiles = await this.deps.repo.getPrFiles(pull.id);
    if (prFiles.length > 0) {
      return prFiles.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        headers: headersFromPatch(f.patch),
      }));
    }
    try {
      const fetched = await this.deps.git.diff(toRepoRef(repo), pull.base, pull.headSha);
      return fileSummariesFromDiff(fetched);
    } catch {
      return [];
    }
  }

  /**
   * Steps 1-9 of spec 006 S10: resolve the model, gather files + linked
   * issues/docs (best-effort, never invented on failure), call the
   * classifier, cap confidence, persist, log. Shared by `classify` (manual)
   * and `ensureForReview` (D4-A auto path).
   */
  private async runClassification(
    pull: PullRow,
    repo: RepoRow,
    opts: ClassifyOptions,
    signal?: AbortSignal,
  ): Promise<PrIntentRecord> {
    const start = Date.now();
    const repoRef = toRepoRef(repo);
    const { provider, model } = await this.deps.resolveModel(pull.workspaceId, 'review_intent');

    const files = await this.fileSummaries(pull, repo, opts.diff);
    signal?.throwIfAborted();
    const links = extractIntentLinks(pull.body, {
      host: forgeHostOf(repo.provider as ForgeProvider, repo.apiBase),
      owner: repo.owner,
      name: repo.name,
      provider: repo.provider as ForgeProvider,
    });

    const sources: IntentSource[] = [];
    const missingContext: MissingContext[] = [];
    const issues: IntentPromptIssue[] = [];
    const docs: IntentPromptDoc[] = [];
    const unavailable: IntentUnavailableSource[] = [];

    // V9: record every input kind the classifier actually used, not just the
    // fetched ones — so the card and logs show the full picture (title is
    // always present; description only when non-empty; the file list is
    // whatever `fileSummaries` resolved, even when empty).
    sources.push({ kind: 'pr_title', ref: 'PR title', status: 'ok', chars: pull.title.length });
    if (pull.body && pull.body.trim().length > 0) {
      sources.push({ kind: 'pr_description', ref: 'PR description', status: 'ok', chars: pull.body.length });
    }
    sources.push({ kind: 'file_list', ref: `${files.length} file(s)`, status: 'ok', chars: files.length });

    const forgeClient =
      links.issues.length > 0 ? await this.deps.forge(repoRef).catch(() => undefined) : undefined;

    for (const link of links.issues) {
      signal?.throwIfAborted();
      if (!forgeClient) {
        const reason = 'unreachable';
        sources.push({ kind: 'linked_issue', ref: link.ref, status: 'failed', reason });
        missingContext.push({ kind: 'linked_issue', ref: link.ref, reason });
        unavailable.push({ kind: 'linked_issue', ref: link.ref, reason });
        continue;
      }
      try {
        const issueRef = { ...repoRef, owner: link.owner, name: link.name, path: `${link.owner}/${link.name}` };
        const issue = await withTimeout(forgeClient.getIssue(issueRef, link.number), SOURCE_TIMEOUT_MS);
        const body = issue.body ?? '';
        issues.push({ ref: link.ref, title: issue.title, body });
        sources.push({ kind: 'linked_issue', ref: link.ref, status: 'ok', chars: body.length });
      } catch (err) {
        const reason = classifyFailure(err);
        sources.push({ kind: 'linked_issue', ref: link.ref, status: 'failed', reason });
        missingContext.push({ kind: 'linked_issue', ref: link.ref, reason });
        unavailable.push({ kind: 'linked_issue', ref: link.ref, reason });
      }
    }

    for (const link of links.docs) {
      signal?.throwIfAborted();
      try {
        // Best-effort: the PR head may not be in the local clone yet (a doc
        // added by the PR itself). Fetch failure alone must not fail the read
        // — `readFileAt` below is what actually decides ok/failed.
        await withTimeout(this.deps.git.fetchPullHead(repoRef, pull.number), SOURCE_TIMEOUT_MS).catch(
          () => undefined,
        );
        const content = await withTimeout(
          this.deps.git.readFileAt(repoRef, pull.headSha, link.path),
          SOURCE_TIMEOUT_MS,
        );
        const truncated = content.length > MAX_DOC_BYTES ? content.slice(0, MAX_DOC_BYTES) : content;
        docs.push({ ref: link.ref, content: truncated });
        sources.push({ kind: 'linked_doc', ref: link.ref, status: 'ok', chars: truncated.length });
      } catch (err) {
        const reason = classifyFailure(err);
        sources.push({ kind: 'linked_doc', ref: link.ref, status: 'failed', reason });
        missingContext.push({ kind: 'linked_doc', ref: link.ref, reason });
        unavailable.push({ kind: 'linked_doc', ref: link.ref, reason });
      }
    }

    for (const link of links.external) {
      sources.push({ kind: 'external_link', ref: link.ref, status: 'unsupported', reason: 'non-forge link (D3)' });
      missingContext.push({ kind: 'external_link', ref: link.ref, reason: 'non-forge link, not fetched' });
    }

    // V2: `RunLogger.logFor` persists only `{t, kind, msg}` — `data` reaches
    // pino and the live SSE stream but is dropped from the reloaded run log.
    // The counts that matter for a human reading that log back must therefore
    // live in the message text itself, not only in `data`.
    const sourceCounts = { ok: 0, failed: 0, unsupported: 0 };
    for (const s of sources) sourceCounts[s.status]++;
    this.log(
      opts,
      `intent: sources (ok=${sourceCounts.ok}, failed=${sourceCounts.failed}, unsupported=${sourceCounts.unsupported})`,
      {
        prId: pull.id,
        sources: sources.map((s) => ({ kind: s.kind, ref: s.ref, status: s.status })),
      },
    );

    signal?.throwIfAborted();
    const llm = await this.deps.llm(provider);
    const result = await classifyIntent({
      llm,
      model,
      input: {
        title: pull.title,
        description: pull.body ?? undefined,
        issues,
        docs,
        unavailable,
        files,
      },
      countTokens: (s) => this.deps.tokenizer.count(s),
      ...(signal ? { signal } : {}),
    });

    this.log(
      opts,
      `intent: prompt composition (provider=${provider}, model=${result.model}, tokens=${result.tokensIn + result.tokensOut})`,
      {
        provider,
        model: result.model,
        sections: result.sections,
        total_tokens: result.tokensIn + result.tokensOut,
      },
    );

    // V6: only sources that are actually "linked" context count toward
    // confidence capping — `pr_title`/`pr_description`/`file_list` (V9) are
    // always `ok` and would otherwise make `okLinked` non-zero even with no
    // description and no reachable link. `external_link` sources are always
    // `unsupported` (D3-A) and MUST count as failed here — an unreachable
    // non-forge link is still missing context, same as a failed issue/doc.
    const LINK_SOURCE_KINDS = new Set<IntentSource['kind']>(['linked_issue', 'linked_doc', 'external_link']);
    const okLinked = sources.filter((s) => LINK_SOURCE_KINDS.has(s.kind) && s.status === 'ok').length;
    const failedLinked = sources.filter((s) => LINK_SOURCE_KINDS.has(s.kind) && s.status !== 'ok').length;
    const confidence = capConfidence(result.data.confidence, {
      hasDescription: Boolean(pull.body?.trim()),
      okLinked,
      failedLinked,
    });

    const durationMs = Date.now() - start;
    const upsert: IntentUpsert = {
      intent: result.data.intent,
      inScope: result.data.in_scope,
      outOfScope: result.data.out_of_scope,
      confidence,
      sources,
      missingContext,
      composition: result.sections,
      headSha: pull.headSha,
      descriptionHash: descriptionHash(pull.title, pull.body),
      provider,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      costSource: result.costSource,
      durationMs,
    };
    signal?.throwIfAborted();
    await this.deps.repo.upsert(pull.id, upsert);

    const costText = result.costUsd !== null ? `$${result.costUsd.toFixed(4)}` : 'n/a';
    this.log(
      opts,
      `intent: classified (confidence=${confidence}, tokens_in=${result.tokensIn}, tokens_out=${result.tokensOut}, cost=${costText}, duration_ms=${durationMs})`,
      {
        confidence,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        durationMs,
      },
    );

    const row = await this.deps.repo.get(pull.id);
    if (!row) throw new Error('pr_intent upsert did not persist a row');
    return this.toRecord(row, pull);
  }

  private toRecord(row: PrIntentRow, pull: PullRow): PrIntentRecord {
    const { stale, staleReason } = staleness(row, pull);
    return {
      intent: row.intent,
      in_scope: row.inScope,
      out_of_scope: row.outOfScope,
      confidence: row.confidence as IntentConfidence,
      pr_id: row.prId,
      head_sha: row.headSha,
      description_hash: row.descriptionHash,
      stale,
      stale_reason: staleReason,
      provider: row.provider,
      model: row.model,
      sources: row.sources as IntentSource[],
      missing_context: row.missingContext as MissingContext[],
      composition: row.composition as PromptSection[],
      tokens_in: row.tokensIn,
      tokens_out: row.tokensOut,
      cost_usd: row.costUsd,
      cost_source: row.costSource as CostSource | null,
      classified_at: row.classifiedAt.toISOString(),
    };
  }
}
