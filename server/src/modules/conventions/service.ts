import { z } from 'zod';
import {
  ConventionCategory,
  type ConventionCandidate,
  type ConventionScan,
  type ConventionScanResult,
  type ConventionSkillPreview,
  type ConventionStatus,
  type Skill,
  type SkillType,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { ValidationError } from '../../platform/errors.js';
import type { Logger } from '../reviews/run-executor.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { SkillsService } from '../skills/service.js';
import { EXTRACTION_SCHEMA_NAME, MAX_CANDIDATES, TOP_FILES } from './constants.js';
import { groundConventions } from './grounding.js';
import { buildExtractionPrompt } from './prompt.js';
import {
  ConventionsRepository,
  type ConventionRow,
  type ConventionScanRow,
  type UpdateCandidate,
} from './repository.js';
import { collectSamplePaths, readSamples } from './samples.js';
import { buildSkillPreviews } from './skill-body.js';

/**
 * Conventions extractor — the orchestration half of spec 004.
 *
 * clone → sample (code, not a model) → one cheap model call → evidence gate →
 * persist. Everything interesting on that line is a pure function in this
 * folder; what lives here is the I/O around them, plus the two rules that have
 * to be enforced server-side to mean anything:
 *
 *   - a re-scan preserves accept/reject decisions (the repository's upsert);
 *   - a rejected candidate never reaches a skill, even when its id is posted
 *     to the commit endpoint by hand (`createSkills` re-derives the set).
 *
 * `undefined` from a method means "not this workspace's repo" — the routes map
 * that to 404, so a foreign id can't be probed through a different status code.
 */

/**
 * The MODEL-facing schema, deliberately narrower than `ConventionCandidate`:
 * no id, no status, no repo. The model is answering a question, not proposing a
 * row — and every field it cannot see is a field it cannot get wrong.
 */
export const ConventionExtraction = z.object({
  conventions: z
    .array(
      z.object({
        category: ConventionCategory,
        rule: z.string().min(8).max(200),
        evidence_path: z.string(),
        evidence_line: z.number().int().positive(),
        evidence_snippet: z.string().min(1).max(600),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(MAX_CANDIDATES),
});

/** One skill as the modal hands it back: a preview the user may have edited. */
export interface ConventionSkillDraft {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  evidence_files: string[];
  /** Which candidates it was built from — re-checked against the accepted set. */
  candidate_ids: string[];
  enabled?: boolean;
}

export class ConventionsService {
  private repo: ConventionsRepository;
  private skills: SkillsService;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
    this.skills = new SkillsService(container);
  }

  /**
   * Run one extraction pass and persist it.
   *
   * The scan row is opened BEFORE the model call and closed after, because the
   * failure path has to be visible: a provider timeout, a missing API key or a
   * fixture the schema rejects all end as a `status: 'error'` row carrying what
   * was sampled and why it stopped — never as a 500 with nothing on file.
   */
  async extract(
    workspaceId: string,
    repoId: string,
    logger?: Logger,
  ): Promise<ConventionScanResult | undefined> {
    const repo = await this.repo.getRepoRef(workspaceId, repoId);
    if (!repo) return undefined;

    const { provider, model } = await resolveFeatureModel(
      this.container,
      workspaceId,
      'conventions',
    );

    // The clone path comes from the injected GitClient, never from
    // `config.cloneDir` by hand — that is what lets a test point the whole
    // sampling stage at a fixture directory.
    const ref = { owner: repo.owner, name: repo.name };
    const cloneDir = this.container.git.clonePathFor(ref);
    // A repo cloned but never pushed to, or not cloned at all: the scan is
    // still worth running, it just cannot pin its evidence links.
    const commitSha = await this.container.git.currentHead(ref).catch(() => null);

    // Returns [] whenever REPO_INTEL_ENABLED=false or the repo is not indexed
    // yet — which is the state of every freshly added repo. `collectSamplePaths`
    // falls back to a deterministic walk for exactly that case.
    const fromIntel = await this.container.repoIntel
      .getConventionSamples(repoId, TOP_FILES)
      .catch(() => [] as string[]);
    const paths = await collectSamplePaths({ cloneDir, fromIntel });
    const files = await readSamples(cloneDir, paths);

    const scan = await this.repo.createScan({
      workspaceId,
      repoId,
      commitSha,
      provider,
      model,
      // What the model was actually SHOWN, not what selection asked for: a path
      // that vanished between the walk and the read was never in the prompt,
      // and the evidence gate judges citations against this same list.
      samplePaths: files.map((f) => f.path),
    });

    if (files.length === 0) {
      return this.failScan(
        workspaceId,
        scan,
        'No files could be sampled from this repository. Is it cloned yet?',
      );
    }

    const { system, user } = buildExtractionPrompt(repo.fullName, files);

    try {
      const llm = await this.container.llm(provider);
      const result = await llm.completeStructured({
        model,
        schema: ConventionExtraction,
        schemaName: EXTRACTION_SCHEMA_NAME,
        messages: [
          { role: 'system' as const, content: system },
          { role: 'user' as const, content: user },
        ],
      });

      const grounded = groundConventions(result.data.conventions, files);
      // The tally, not the candidates: when rules go missing this line is the
      // first thing to read, and it answers "how many, and why" on its own.
      logger?.info(
        {
          repoId,
          scanId: scan.id,
          raw: grounded.raw,
          kept: grounded.kept.length,
          dropped: grounded.dropped,
        },
        'conventions: evidence gate',
      );

      await this.repo.upsertCandidates(
        grounded.kept.map((c) => ({
          workspaceId,
          repoId,
          scanId: scan.id,
          rule: c.rule,
          category: c.category,
          evidencePath: c.evidence_path,
          evidenceLine: c.evidence_line,
          evidenceEndLine: c.evidence_end_line,
          evidenceSnippet: c.evidence_snippet,
          confidence: c.confidence,
          fingerprint: c.fingerprint,
        })),
      );

      const finished = await this.repo.finishScan(workspaceId, scan.id, {
        status: 'done',
        candidatesRaw: grounded.raw,
        candidatesKept: grounded.kept.length,
        dropped: grounded.dropped,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        costSource: result.costSource ?? null,
      });

      const rows = await this.repo.listByScan(workspaceId, scan.id);
      return { scan: toScanDto(finished ?? scan), candidates: rows.map(toCandidateDto) };
    } catch (err) {
      logger?.error(
        { repoId, scanId: scan.id, err: (err as Error).message },
        'conventions: extraction failed',
      );
      return this.failScan(workspaceId, scan, (err as Error).message);
    }
  }

  /**
   * The latest scan and the candidates it found.
   *
   * Candidates are scoped to that scan rather than to the repo so every
   * `path:line` on screen resolves against the `commit_sha` returned beside it
   * — a rule the newest scan did not re-find would otherwise be rendered with a
   * link pinned to a commit it was never seen in. Nothing is lost by hiding it:
   * the row keeps its status, and the next scan that finds the rule again
   * brings it back with the decision intact.
   */
  async latest(workspaceId: string, repoId: string): Promise<ConventionScanResult | undefined> {
    const repo = await this.repo.getRepoRef(workspaceId, repoId);
    if (!repo) return undefined;

    const scan = await this.repo.latestScan(workspaceId, repoId);
    if (!scan) return { scan: null, candidates: [] };

    const rows = await this.repo.listByScan(workspaceId, scan.id);
    return { scan: toScanDto(scan), candidates: rows.map(toCandidateDto) };
  }

  /** Accept, reject, or fix the wording of one candidate. */
  async updateCandidate(
    workspaceId: string,
    id: string,
    patch: UpdateCandidate,
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toCandidateDto(row) : undefined;
  }

  /**
   * What a skill built from the accepted set WOULD look like. Persists nothing:
   * abandoning the modal must leave no row behind, the same property
   * `POST /skills/import/preview` gives the import drawer.
   */
  async preview(
    workspaceId: string,
    repoId: string,
    split: boolean,
  ): Promise<ConventionSkillPreview[] | undefined> {
    const accepted = await this.acceptedFor(workspaceId, repoId);
    if (!accepted) return undefined;
    return buildSkillPreviews({
      repoName: accepted.repoName,
      candidates: accepted.candidates,
      split,
    });
  }

  /**
   * Turn confirmed previews into real skills.
   *
   * The accepted set is re-derived here rather than trusted from the request:
   * the modal's ids are a client's claim, and "a rejected rule never reaches a
   * skill" is only true if the server checks. Creation itself goes through
   * `SkillsService.create`, so versioning and the `source` rules stay in one
   * place — `enabled` defaults to on because, unlike an import, this body was
   * assembled from evidence the user just read and approved.
   */
  async createSkills(
    workspaceId: string,
    repoId: string,
    drafts: ConventionSkillDraft[],
  ): Promise<Skill[] | undefined> {
    const accepted = await this.acceptedFor(workspaceId, repoId);
    if (!accepted) return undefined;

    const acceptedIds = new Set(accepted.candidates.map((c) => c.id));
    const refused = [
      ...new Set(drafts.flatMap((d) => d.candidate_ids).filter((id) => !acceptedIds.has(id))),
    ];
    if (refused.length > 0) {
      throw new ValidationError(
        'Those candidates are not accepted conventions of this repo, so they cannot become a skill.',
        { candidate_ids: refused },
      );
    }

    const created: Skill[] = [];
    for (const draft of drafts) {
      const skill = await this.skills.create(workspaceId, {
        name: draft.name,
        description: draft.description,
        type: draft.type,
        body: draft.body,
        source: 'extracted',
        enabled: draft.enabled ?? true,
        evidence_files: draft.evidence_files,
      });
      // Stamped AFTER the skill exists, so a failed create leaves no candidate
      // pointing at a skill that was never written.
      await this.repo.stampSkill(workspaceId, draft.candidate_ids, skill.id);
      created.push(skill);
    }
    return created;
  }

  /** Close a scan as failed and return it — an error is a result, not a 500. */
  private async failScan(
    workspaceId: string,
    scan: ConventionScanRow,
    message: string,
  ): Promise<ConventionScanResult> {
    const finished = await this.repo.finishScan(workspaceId, scan.id, {
      status: 'error',
      error: message,
    });
    return { scan: toScanDto(finished ?? scan), candidates: [] };
  }

  /**
   * The accepted candidates of the latest scan, plus the repo name the skill is
   * named after. `undefined` = not this workspace's repo; an empty list is an
   * ordinary answer (nothing accepted yet) and yields no previews.
   */
  private async acceptedFor(
    workspaceId: string,
    repoId: string,
  ): Promise<{ repoName: string; candidates: ConventionCandidate[] } | undefined> {
    const repo = await this.repo.getRepoRef(workspaceId, repoId);
    if (!repo) return undefined;

    const scan = await this.repo.latestScan(workspaceId, repoId);
    if (!scan) return { repoName: repo.name, candidates: [] };

    const rows = await this.repo.listByScan(workspaceId, scan.id);
    return {
      repoName: repo.name,
      candidates: rows.filter((r) => r.status === 'accepted').map(toCandidateDto),
    };
  }
}

/**
 * Row → DTO. Both mappers stay total (`row.status as ConventionStatus`) rather
 * than switching over the enum: `text(..., { enum })` puts no constraint in SQL,
 * so a value retired from the contract still reads back out of an old row and
 * must not throw on the way to the screen.
 */
function toCandidateDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    repo_id: row.repoId,
    scan_id: row.scanId ?? '',
    rule: row.rule,
    category: row.category as ConventionCandidate['category'],
    evidence_path: row.evidencePath,
    evidence_line: row.evidenceLine,
    evidence_end_line: row.evidenceEndLine,
    evidence_snippet: row.evidenceSnippet,
    confidence: row.confidence ?? 0,
    status: row.status as ConventionStatus,
    skill_id: row.skillId,
    created_at: row.createdAt.toISOString(),
  };
}

function toScanDto(row: ConventionScanRow): ConventionScan {
  return {
    id: row.id,
    repo_id: row.repoId,
    commit_sha: row.commitSha,
    provider: row.provider,
    model: row.model,
    sample_paths: row.samplePaths,
    candidates_raw: row.candidatesRaw,
    candidates_kept: row.candidatesKept,
    dropped: row.dropped,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    status: row.status,
    error: row.error,
    created_at: row.createdAt.toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
  };
}
