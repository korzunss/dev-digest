import {
  PrBrief,
  PrBriefModelOutput,
  type BlastRadius,
  type BriefFailureReason,
  type BriefMissingInput,
  type FeatureModelChoice,
  type FeatureModelId,
  type LLMProvider,
  type PrBriefView,
  type SmartDiffRole,
} from '@devdigest/shared';
import { changedLineRanges } from '../_shared/diff-hunks.js';
import { mergeContextPaths } from '../_shared/context-paths.js';
import { capBlast, fitToBudget } from './budget.js';
import {
  BRIEF_LLM_TIMEOUT_MS,
  BRIEF_MAX_OUTPUT_TOKENS,
  BRIEF_SCHEMA_NAME,
} from './constants.js';
import { groundBrief, groundingContext } from './grounding.js';
import { classifyBriefError } from './helpers.js';
import { buildBriefMessages } from './prompt.js';
import type { BriefRepository } from './repository.js';
import type {
  BriefAgentsPort,
  BriefBlastFacts,
  BriefBlastPort,
  BriefContextPort,
  BriefFacts,
  BriefIntentPort,
  BriefLogger,
  BriefSmartDiffPort,
  TokenCounter,
} from './types.js';

/**
 * Everything `BriefService` needs, injected by the composition root
 * (`container.brief`). Collaborators are structural ports from `types.ts`.
 */
export interface BriefServiceDeps {
  repo: Pick<BriefRepository, 'getPull' | 'getPrFiles' | 'latestReview' | 'getBrief' | 'upsertBrief'>;
  intent: BriefIntentPort;
  blast: BriefBlastPort;
  smartDiff: BriefSmartDiffPort;
  agents: BriefAgentsPort;
  context: BriefContextPort;
  llm: (id: FeatureModelChoice['provider']) => Promise<LLMProvider>;
  tokenizer: TokenCounter;
  resolveModel: (workspaceId: string, id: FeatureModelId) => Promise<FeatureModelChoice>;
  now?: () => Date;
}

type Gathered = { facts: BriefFacts; missing: BriefMissingInput[]; blast: BlastRadius | undefined };

function missingEntry(
  input: BriefMissingInput['input'],
  status: BriefMissingInput['status'],
  ref: string | null = null,
  reason: string | null = null,
): BriefMissingInput {
  return { input, status, ref, reason };
}

function blastFacts(blast: BlastRadius): BriefBlastFacts {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  const callers: BriefBlastFacts['callers'] = [];
  for (const d of blast.downstream) {
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const c of d.crons_affected) crons.add(c);
    for (const c of d.callers) callers.push({ symbol: d.symbol, name: c.name, file: c.file, line: c.line });
  }
  return {
    changed_symbols: blast.changed_symbols.map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    callers,
    endpoints: [...endpoints],
    crons: [...crons],
    degraded: blast.degraded,
    reason: blast.reason,
  };
}

/**
 * PR Brief (spec 010) — orchestration only.
 *
 *   GET  `getView`   stored brief + staleness, never calls the model (AC-43).
 *   POST `generate`  guard -> facts (best-effort) -> fit -> one structured
 *                    call -> grounding -> upsert. A failure leaves the stored
 *                    row untouched and is reported in the view.
 *
 * `undefined` means "not this workspace's PR" (routes -> 404). The in-flight
 * guard is in memory: the API is a single instance.
 */
export class BriefService {
  private inFlight = new Set<string>();

  constructor(private deps: BriefServiceDeps) {}

  async getView(
    workspaceId: string,
    prId: string,
    failure: BriefFailureReason | null = null,
  ): Promise<PrBriefView | undefined> {
    const found = await this.deps.repo.getPull(workspaceId, prId);
    if (!found) return undefined;
    const parsed = PrBrief.safeParse(await this.deps.repo.getBrief(prId));
    const brief = parsed.success ? parsed.data : null;
    return {
      pr_id: prId,
      pr_head_sha: found.pull.headSha,
      brief,
      stale: brief ? brief.head_sha !== found.pull.headSha : false,
      generating: this.inFlight.has(prId),
      failure,
    };
  }

  async generate(
    workspaceId: string,
    prId: string,
    log: BriefLogger,
  ): Promise<PrBriefView | undefined> {
    if (this.inFlight.has(prId)) return this.getView(workspaceId, prId, 'in_progress');
    this.inFlight.add(prId); // before the first await: the guard must close the race

    let failure: Exclude<BriefFailureReason, 'in_progress'> | null = null;
    try {
      const found = await this.deps.repo.getPull(workspaceId, prId);
      if (!found) return undefined;
      await this.run(workspaceId, found.pull, found.repo, log);
    } catch (err) {
      failure = classifyBriefError(err);
      const name = err instanceof Error ? err.name : 'unknown';
      log.warn(`brief: failed reason=${failure} err=${name}`);
    } finally {
      this.inFlight.delete(prId);
    }
    return this.getView(workspaceId, prId, failure);
  }

  private async run(
    workspaceId: string,
    pull: NonNullable<Awaited<ReturnType<BriefRepository['getPull']>>>['pull'],
    repo: NonNullable<Awaited<ReturnType<BriefRepository['getPull']>>>['repo'],
    log: BriefLogger,
  ): Promise<void> {
    const start = Date.now();
    const headSha = pull.headSha; // captured before the call (AC-41)
    const { provider, model } = await this.deps.resolveModel(workspaceId, 'risk_brief');
    const llm = await this.deps.llm(provider); // a ConfigError here reads nothing else (AC-8)

    const gathered = await this.gather(workspaceId, pull, repo, log);
    const fit = fitToBudget(gathered.facts, this.deps.tokenizer);
    const missing = [...gathered.missing];
    for (const t of fit.truncated) {
      if (!missing.some((m) => m.input === t.input && m.status === 'truncated')) missing.push(t);
    }

    const result = await llm.completeStructured({
      model,
      schema: PrBriefModelOutput,
      schemaName: BRIEF_SCHEMA_NAME,
      messages: buildBriefMessages(fit.facts),
      temperature: 0,
      maxTokens: BRIEF_MAX_OUTPUT_TOKENS,
      timeoutMs: BRIEF_LLM_TIMEOUT_MS,
      maxRetries: 0, // a validation failure is a failure (AC-7)
      requireParameters: true,
      signal: AbortSignal.timeout(BRIEF_LLM_TIMEOUT_MS),
    });

    const duration = Date.now() - start;
    log.info(
      `brief: ${provider}/${result.model} tokens ${result.tokensIn}/${result.tokensOut} cost ${result.costUsd ?? 'n/a'} duration_ms ${duration}`,
    );

    // Grounding runs against ALL files and the FULL blast, not the trimmed prompt copy.
    const files = await this.deps.repo.getPrFiles(pull.id);
    const grounded = groundBrief(result.data, groundingContext(files, gathered.blast));
    const stored: PrBrief = {
      summary: grounded.summary,
      risks: { risks: grounded.risks },
      review_focus: grounded.review_focus,
      missing_inputs: missing,
      head_sha: headSha,
      generated_at: (this.deps.now?.() ?? new Date()).toISOString(),
      model: { provider, model: result.model },
      usage: {
        tokens_in: result.tokensIn ?? null,
        tokens_out: result.tokensOut ?? null,
        cost_usd: result.costUsd ?? null,
        cost_source: result.costSource ?? null,
      },
    };
    await this.deps.repo.upsertBrief(pull.id, stored);
  }

  /** Best-effort fact gathering: every input in its own try/catch (AC-14..21). */
  private async gather(
    workspaceId: string,
    pull: Parameters<BriefIntentPort['readLinkedIssues']>[0],
    repo: Parameters<BriefIntentPort['readLinkedIssues']>[1],
    log: BriefLogger,
  ): Promise<Gathered> {
    const missing: BriefMissingInput[] = [];
    const prId = pull.id;

    const files = await this.deps.repo.getPrFiles(prId);
    const roles = new Map<string, SmartDiffRole>();
    try {
      const sd = await this.deps.smartDiff.get(workspaceId, prId);
      for (const g of sd?.groups ?? []) for (const f of g.files) roles.set(f.path, g.role);
    } catch {
      // roles are optional context
    }

    let intent: BriefFacts['intent'] = null;
    try {
      const resp = await this.deps.intent.get(workspaceId, prId);
      const rec = resp?.intent;
      if (!rec) {
        missing.push(missingEntry('intent', 'missing'));
      } else {
        intent = {
          intent: rec.intent,
          in_scope: rec.in_scope,
          out_of_scope: rec.out_of_scope,
          confidence: rec.confidence,
          stale: rec.stale,
        };
        if (rec.stale) missing.push(missingEntry('intent', 'stale', null, rec.stale_reason));
      }
    } catch {
      missing.push(missingEntry('intent', 'missing'));
    }

    let blast: BlastRadius | undefined;
    let blastForFacts: BriefBlastFacts | null = null;
    try {
      blast = await this.deps.blast.getBlast(workspaceId, prId, log);
      if (!blast) {
        missing.push(missingEntry('blast_radius', 'missing'));
      } else {
        if (blast.degraded) missing.push(missingEntry('blast_radius', 'partial', null, blast.reason));
        const capped = capBlast(blastFacts(blast));
        blastForFacts = capped.blast;
        if (capped.truncated) missing.push(missingEntry('blast_radius', 'truncated'));
      }
    } catch {
      blast = undefined;
      missing.push(missingEntry('blast_radius', 'missing'));
    }

    let findings: BriefFacts['findings'] = [];
    try {
      const review = await this.deps.repo.latestReview(prId);
      if (!review) missing.push(missingEntry('review_findings', 'missing'));
      else {
        findings = review.findings.map((f) => ({
          file: f.file,
          line: f.startLine,
          severity: f.severity,
          title: f.title,
        }));
      }
    } catch {
      missing.push(missingEntry('review_findings', 'missing'));
    }

    let issues: BriefFacts['issues'] = [];
    try {
      const linked = await this.deps.intent.readLinkedIssues(pull, repo);
      issues = linked.issues.map((i) => ({ ref: i.ref, title: i.title, body: i.body }));
      for (const f of linked.failed) missing.push(missingEntry('linked_issue', 'missing', f.ref, f.reason));
    } catch {
      // the linked-issue read itself failed: say the input is missing (AC-21)
      missing.push(missingEntry('linked_issue', 'missing'));
    }

    const docs = await this.readDocs(repo, workspaceId, missing);

    const facts: BriefFacts = {
      pr: {
        title: pull.title,
        author: pull.author,
        branch: pull.branch,
        base: pull.base,
        head_sha: pull.headSha,
      },
      files: files.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        role: roles.get(f.path) ?? null,
        ranges: changedLineRanges(f.patch),
      })),
      intent,
      blast: blastForFacts,
      findings,
      description: pull.body ?? '',
      issues,
      docs,
    };
    return { facts, missing, blast };
  }

  private async readDocs(
    repo: Parameters<BriefIntentPort['readLinkedIssues']>[1],
    workspaceId: string,
    missing: BriefMissingInput[],
  ): Promise<BriefFacts['docs']> {
    try {
      const agents = await this.deps.agents.listEnabled(workspaceId);
      const own: string[] = [];
      const inherited: string[] = [];
      for (const a of agents) {
        own.push(...(await this.deps.agents.listContextDocs(a.id)).map((d) => d.path));
        inherited.push(...(await this.deps.agents.inheritedContextDocs(a.id)).map((d) => d.path));
      }
      const paths = mergeContextPaths(own, inherited);
      if (paths.length === 0) {
        missing.push(missingEntry('attached_specs', 'missing'));
        return [];
      }
      const res = await this.deps.context.readDocsForRun(
        { owner: repo.owner, name: repo.name, contextGlobs: repo.contextGlobs },
        paths,
      );
      for (const s of res.skipped) missing.push(missingEntry('attached_specs', 'missing', s.path, s.reason));
      return res.docs.map((d) => ({ path: d.path, body: d.body }));
    } catch {
      missing.push(missingEntry('attached_specs', 'missing'));
      return [];
    }
  }
}
