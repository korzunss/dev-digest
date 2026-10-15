import type {
  CommitAhead,
  CiFile,
  CiInstallation,
  CiInstallationView,
  CiInstallInput,
  CiInstallResult,
  CiPreview,
  CiPreviewInput,
  CiRefreshResult,
  CiRunsPage,
  CiRunsQuery,
  CiValidateWorkflowInput,
  CiWorkflowCheck,
  ForgeClient,
  RepoRef,
  WorkflowRunMeta,
} from '@devdigest/shared';
import { z } from 'zod';
import { CiTrigger, Verdict } from '@devdigest/shared';
import { AppError, ConfigError, NotFoundError, ValidationError } from '../../platform/errors.js';
import type { CiInstallationRow, CiRunRow, RunsCursor } from './repository.js';
import type { CiAgent, CiServiceDeps } from './types.js';
import {
  ARTIFACT_NAME,
  CI_BRANCH,
  EXPORT_TRAILER,
  LOOKBACK_DAYS,
  MAX_RUNS,
  MAX_RUN_PAGES,
  MAX_ZIP_BYTES,
  PR_TITLE,
  PRUNE_RULES,
  WORKFLOW_FILE,
  WORKFLOW_VERSION,
} from './constants.js';
import { buildExportFiles, prBody, runnerVersionOf, zipFiles } from './export-files.js';
import { generateWorkflow, shipWorkflow, validateWorkflow } from './workflow.js';
import { nextCursor, parseResultArtifact, toStatus } from './artifact.js';

const DAY_MS = 86_400_000;
const DEFAULT_RUNS_WINDOW_DAYS = 7;
const DEFAULT_RUNS_LIMIT = 50;

const SUBJECT_MAX = 72;
// Bidi / direction marks that can visually reorder untrusted text (written as escapes on purpose).
const BIDI_CONTROLS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Display data for the `foreign_commits` refusal. All commit fields are untrusted text (the client renders them as text); the URL is built from the repo row. */
function foreignDetails(foreign: CommitAhead, ahead: CommitAhead[], fullName: string) {
  // The adapter marks "more commits than one page" with a commit that has no sha — anywhere in the list.
  const truncated = ahead.some((c) => c.sha === '');
  const real = foreign.sha !== '';
  const clean = (s: string, max: number): string => {
    const t = s.replace(BIDI_CONTROLS, '').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  };
  return {
    truncated,
    sha: real ? foreign.sha.slice(0, 7) : null,
    author: real && foreign.author ? clean(foreign.author, 64) : null,
    date: real && foreign.date && ISO_DATE.test(foreign.date) ? foreign.date : null,
    subject: real ? clean(foreign.message.split('\n')[0] ?? '', SUBJECT_MAX) : null,
    ahead_count: ahead.filter((c) => c.sha !== '').length,
    branch_url: `https://github.com/${fullName}/tree/${CI_BRANCH}`,
  };
}

/** `acme/api` → a forge ref. The full name comes from our own repos/installation rows. */
function refOf(fullName: string): RepoRef {
  const i = fullName.lastIndexOf('/');
  return { owner: fullName.slice(0, i), name: fullName.slice(i + 1), path: fullName };
}

const TRAILER_LINE = new RegExp(`^${EXPORT_TRAILER}:`, 'm');

type GithubRepo = { id: string; fullName: string; defaultBranch: string };

/**
 * Export-to-CI application service (plan 41): preview / validate / install an
 * agent as a GitHub Actions workflow, then ingest the runs it produced.
 * Depends on ports only (forge, runner bundle, agents) plus its own repository.
 */
export class CiService {
  private inflightRefresh = new Map<string, Promise<CiRefreshResult>>();

  constructor(private deps: CiServiceDeps) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  // ------------------------------------------------------------- export

  async preview(workspaceId: string, agentId: string, input: CiPreviewInput): Promise<CiPreview> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const repo = await this.requireGithubRepo(workspaceId, input.repo_id);
    const existing = await this.deps.repo.findInstallation(agent.id, repo.fullName);
    const built = await this.build(workspaceId, agent, repo, input);
    if (!built.ok) {
      return {
        files: [],
        file_count: 0,
        existing_installation_id: existing?.id ?? null,
        blocked: built.blocked,
      };
    }
    return {
      files: built.files,
      file_count: built.files.length,
      existing_installation_id: existing?.id ?? null,
      blocked: null,
    };
  }

  validateWorkflow(input: CiValidateWorkflowInput): CiWorkflowCheck {
    return validateWorkflow(input.workflow, { triggers: input.triggers, postAs: input.post_as });
  }

  async install(
    workspaceId: string,
    agentId: string,
    input: CiInstallInput,
  ): Promise<CiInstallResult> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const repo = await this.requireGithubRepo(workspaceId, input.repo_id);

    // One agent per repo: the workflow, its branch and `.devdigest/agents/` are per repo.
    const other = await this.deps.repo.findOtherAgentInstallation(workspaceId, repo.fullName, agent.id);
    if (other) {
      throw new AppError(
        'repo_has_other_agent',
        `${repo.fullName} already runs the agent "${other.agentName}". A repository runs one DevDigest agent: use Update CI config on "${other.agentName}", or Remove its CI installation first.`,
        409,
      );
    }

    const built = await this.build(workspaceId, agent, repo, input);
    if (!built.ok) {
      throw new AppError(built.blocked.code, built.blocked.message, 422, {
        field: built.blocked.field,
      });
    }
    const files = built.files;
    const runnerVersion = built.runnerVersion;

    let prUrl: string | null = null;
    let prNumber: number | null = null;
    let zipBase64: string | null = null;

    if (input.mode === 'zip') {
      zipBase64 = Buffer.from(zipFiles(files)).toString('base64');
    } else {
      const pr = await this.openExportPr(repo.fullName, files, agent);
      prUrl = pr.url;
      prNumber = pr.number;
    }

    // Recorded only after the PR exists (AC-28/29).
    const row = await this.deps.repo.upsertInstallation({
      agentId: agent.id,
      repo: repo.fullName,
      repoId: repo.id,
      mode: input.mode === 'zip' ? 'manual' : 'pr',
      exportedAgentVersion: agent.version,
      exportedCiFailOn: agent.ciFailOn,
      workflowVersion: WORKFLOW_VERSION,
      runnerVersion,
      triggers: input.triggers,
      postAs: input.post_as,
      prNumber,
      prUrl,
    });
    return { installation: toInstallation(row), pr_url: prUrl, zip_base64: zipBase64 };
  }

  private async requireAgent(workspaceId: string, agentId: string): Promise<CiAgent> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  private async requireGithubRepo(workspaceId: string, repoId: string): Promise<GithubRepo> {
    const repos = await this.deps.repo.githubReposForWorkspace(workspaceId);
    const repo = repos.find((r) => r.id === repoId);
    if (!repo) {
      throw new AppError('repo_not_github', 'The repository is not a connected GitHub repo', 422);
    }
    return repo;
  }

  private async build(
    workspaceId: string,
    agent: CiAgent,
    repo: GithubRepo,
    input: Pick<CiPreviewInput, 'triggers' | 'post_as'> & { workflow?: string },
  ) {
    const wfOpts = { triggers: input.triggers, postAs: input.post_as };
    if (input.workflow !== undefined) {
      const check = validateWorkflow(input.workflow, wfOpts);
      if (check.errors.length > 0) {
        throw new AppError('workflow_invalid', check.errors[0]!.message, 422, check);
      }
    }
    if (agent.provider !== 'openrouter') {
      return {
        ok: false as const,
        blocked: {
          code: 'provider_not_openrouter' as const,
          message:
            'CI export supports OpenRouter agents only. Switch this agent’s provider to OpenRouter in Config.',
          field: 'provider',
        },
      };
    }
    const [linked, memory, runnerJs] = await Promise.all([
      this.deps.agents.linkedSkills(agent.id),
      this.deps.repo.memoryForExport(workspaceId, repo.id),
      this.deps.bundle.read(),
    ]);
    // Never the raw submission: regenerate and patch in the validated fields.
    const workflow =
      input.workflow === undefined ? generateWorkflow(wfOpts) : shipWorkflow(input.workflow, wfOpts);
    const result = buildExportFiles({
      agent: {
        name: agent.name,
        provider: agent.provider,
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        strategy: agent.strategy,
        ciFailOn: agent.ciFailOn,
      },
      version: agent.version,
      skills: linked.map((l) => ({ name: l.skill.name, body: l.skill.body })),
      memory,
      workflow,
      runnerJs,
    });
    if (!result.ok) return result;
    return { ok: true as const, files: result.files, runnerVersion: runnerVersionOf(runnerJs) };
  }

  /** DN3 branch flow. Never force-pushes; refuses rather than touching foreign work. */
  private async openExportPr(
    fullName: string,
    files: CiFile[],
    agent: CiAgent,
  ): Promise<{ url: string; number: number }> {
    const ref = refOf(fullName);
    let forge: ForgeClient;
    try {
      forge = await this.deps.forge({ provider: 'github' });
    } catch (err) {
      if (err instanceof ConfigError) {
        throw new AppError('token_missing', 'No GitHub token is configured. Add one in Settings.', 422);
      }
      throw err;
    }

    const scopes = await forge.tokenScopes();
    if (scopes && !scopes.includes('workflow')) {
      throw new AppError(
        'missing_workflow_permission',
        'The GitHub token lacks the "workflow" scope needed to write workflow files.',
        403,
      );
    }

    const base = await forge.getDefaultBranch(ref);
    const branch = await forge.getBranch(ref, CI_BRANCH);
    const message = `${PR_TITLE}\n\n${EXPORT_TRAILER}: agent=${agent.id} version=${agent.version}`;
    const payload = { branch: CI_BRANCH, base, message, files, prune: [...PRUNE_RULES] };
    const prInput = { title: PR_TITLE, head: CI_BRANCH, base, body: prBody(files, fullName) };

    if (!branch) {
      await forge.commitFiles(ref, { ...payload, expectedHeadSha: null });
      return forge.openPullRequest(ref, prInput);
    }
    if (branch.protected) {
      throw new AppError(
        'branch_protected',
        `Branch ${CI_BRANCH} is protected; download the zip instead.`,
        409,
      );
    }
    const ahead = await forge.listCommitsAhead(ref, base, CI_BRANCH);
    const foreign = ahead.find((c) => !TRAILER_LINE.test(c.message));
    if (foreign) {
      throw new AppError(
        'foreign_commits',
        `Branch ${CI_BRANCH} has commits that DevDigest did not make; download the zip instead.`,
        409,
        foreignDetails(foreign, ahead, fullName),
      );
    }
    const open = await forge.findOpenPr(ref, CI_BRANCH);
    if (open) {
      await forge.commitFiles(ref, { ...payload, expectedHeadSha: branch.sha });
      return open;
    }
    await forge.deleteBranch(ref, CI_BRANCH);
    await forge.commitFiles(ref, { ...payload, expectedHeadSha: null });
    return forge.openPullRequest(ref, prInput);
  }

  // ------------------------------------------------------ installations

  async listInstallations(workspaceId: string, agentId: string): Promise<CiInstallationView[]> {
    const agent = await this.requireAgent(workspaceId, agentId);
    const rows = await this.deps.repo.listInstallations(agent.id);
    const latest = await this.deps.repo.latestRunByInstallation(rows.map((r) => r.id));
    let forge: ForgeClient | null = null;
    if (rows.some((r) => r.mode === 'pr' && r.prNumber !== null)) {
      forge = await this.deps.forge({ provider: 'github' }).catch(() => null);
    }
    return Promise.all(
      rows.map(async (row) => {
        const prState = await this.prState(forge, row);
        const run = latest.get(row.id);
        const state: CiInstallationView['state'] =
          row.repoId === null ? 'inactive' : prState === 'open' ? 'pending_merge' : 'active';
        return {
          ...toInstallation(row),
          pr_state: prState,
          state,
          out_of_date:
            (row.exportedAgentVersion !== null && row.exportedAgentVersion < agent.version) ||
            (row.workflowVersion !== null && row.workflowVersion < WORKFLOW_VERSION),
          gate_drift: row.exportedCiFailOn !== null && row.exportedCiFailOn !== agent.ciFailOn,
          latest_run: run ? { status: run.status, ran_at: run.ranAt.toISOString() } : null,
        };
      }),
    );
  }

  private async prState(
    forge: ForgeClient | null,
    row: CiInstallationRow,
  ): Promise<CiInstallationView['pr_state']> {
    if (row.mode !== 'pr' || row.prNumber === null) return 'none';
    if (!forge) return 'unknown';
    try {
      return await forge.getPullState(refOf(row.repo), row.prNumber);
    } catch {
      return 'unknown';
    }
  }

  /** Deletes only the installation; past runs stay (AC-60). */
  async remove(workspaceId: string, id: string): Promise<void> {
    const ok = await this.deps.repo.deleteInstallation(workspaceId, id);
    if (!ok) throw new NotFoundError('Installation not found');
  }

  // ------------------------------------------------------------- ingest

  /** One refresh per (workspace, agent) at a time: a second call shares the running one. */
  refresh(workspaceId: string, agentId: string | null): Promise<CiRefreshResult> {
    const key = `${workspaceId}:${agentId ?? '*'}`;
    const running = this.inflightRefresh.get(key);
    if (running) return running;
    const p = this.doRefresh(workspaceId, agentId).finally(() => this.inflightRefresh.delete(key));
    this.inflightRefresh.set(key, p);
    return p;
  }

  private async doRefresh(workspaceId: string, agentId: string | null): Promise<CiRefreshResult> {
    const installations = await this.deps.repo.listActiveInstallations(
      workspaceId,
      agentId ?? undefined,
    );
    const out: CiRefreshResult = { recorded: 0, rejected: [], errors: [] };
    // Sequential per repo: keeps GitHub's secondary rate limit happy and the order stable.
    for (const inst of installations) {
      try {
        out.recorded += await this.ingest(workspaceId, inst, out);
      } catch (err) {
        out.errors.push({
          repo: inst.repo,
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
    return out;
  }

  /** DN4 for one installation. Returns how many runs were newly recorded. */
  private async ingest(
    workspaceId: string,
    inst: CiInstallationRow,
    out: CiRefreshResult,
  ): Promise<number> {
    const forge = await this.deps.forge({ provider: 'github' });
    const ref = refOf(inst.repo);
    const floor = this.now().getTime() - LOOKBACK_DAYS * DAY_MS;
    const cursor = inst.scanCursor ? inst.scanCursor.getTime() : null;

    // Every run of the lookback window, newest first, page by page up to the cap.
    const listed: WorkflowRunMeta[] = [];
    for (let page = 1; page <= MAX_RUN_PAGES; page++) {
      const batch = await forge.listWorkflowRuns(ref, WORKFLOW_FILE, {
        perPage: MAX_RUNS,
        page,
        createdSince: new Date(floor).toISOString(),
      });
      listed.push(...batch);
      if (batch.length < MAX_RUNS) break;
      if (page === MAX_RUN_PAGES) {
        out.errors.push({
          repo: inst.repo,
          message: `More than ${MAX_RUNS * MAX_RUN_PAGES} workflow runs in ${LOOKBACK_DAYS} days; the oldest were not read.`,
        });
      }
    }
    // A run is new work when it changed after the cursor: a fresh run, a re-run, or one that completed since.
    const scanned = listed.filter(
      (r) => r.status === 'completed' && (cursor === null || Date.parse(r.updated_at) > cursor),
    );

    const completed = scanned;
    const done = new Set(
      (await this.deps.repo.recordedAttempts(workspaceId, inst.repo, completed.map((r) => r.id))).map(
        (r) => `${r.githubRunId}:${r.runAttempt}`,
      ),
    );
    const agentName = (await this.deps.agents.getById(workspaceId, inst.agentId))?.name ?? null;

    let recorded = 0;
    for (const run of completed) {
      if (done.has(`${run.id}:${run.run_attempt}`)) continue;
      const artifacts = await forge.listRunArtifacts(ref, run.id);
      const meta = artifacts.find((a) => a.name === ARTIFACT_NAME && !a.expired);
      if (!meta) continue; // no artifact, or expired: nothing to record (AC-50)

      let bytes: Uint8Array;
      try {
        bytes = await forge.downloadArtifact(ref, meta.id, MAX_ZIP_BYTES);
      } catch (err) {
        const status = (err as { status?: unknown } | null)?.status;
        if (status === 410) continue;
        if (err instanceof AppError && err.code === 'artifact_too_large') {
          out.rejected.push({ repo: inst.repo, run_id: String(run.id), reason: 'zip_too_large' });
          continue;
        }
        throw err;
      }
      const parsed = parseResultArtifact(bytes, run);
      if (!parsed.ok) {
        out.rejected.push({ repo: inst.repo, run_id: String(run.id), reason: parsed.reason });
        continue;
      }
      const a = parsed.value;
      // Identity (repo, PR, SHA, job) comes from GitHub's metadata, never the artifact (AC-46).
      const prNumber = run.pr_numbers[0] ?? null;
      const localPrId =
        prNumber !== null && inst.repoId ? await this.deps.repo.localPrId(inst.repoId, prNumber) : null;
      const jobUrl = (await forge.firstJobUrl(ref, run.id, run.run_attempt).catch(() => null)) ?? run.html_url;
      const isNew = await this.deps.repo.recordCiRun({
        workspaceId,
        installationId: inst.id,
        agentId: inst.agentId,
        agentName: agentName ?? a.agent_name,
        repoFullName: inst.repo,
        githubRunId: run.id,
        runAttempt: run.run_attempt,
        headSha: run.head_sha,
        prNumber,
        localPrId,
        ranAt: new Date(run.created_at),
        status: toStatus(a),
        verdict: a.verdict,
        findingsCount: a.findings_count,
        costUsd: a.cost_usd,
        durationMs: a.duration_ms,
        model: a.model,
        agentVersion: a.agent_version,
        runnerVersion: a.runner_version,
        errorClass: a.error_class,
        jobUrl,
        tokensIn: a.tokens_in,
        tokensOut: a.tokens_out,
        blockers: a.critical,
      });
      if (isNew) recorded += 1;
    }

    const next = nextCursor(scanned, inst.scanCursor ? inst.scanCursor.toISOString() : null);
    if (next) await this.deps.repo.setScanCursor(inst.id, new Date(next));
    return recorded;
  }

  // --------------------------------------------------------------- runs

  async listRuns(workspaceId: string, query: CiRunsQuery): Promise<CiRunsPage> {
    let since = new Date(this.now().getTime() - DEFAULT_RUNS_WINDOW_DAYS * DAY_MS);
    if (query.since !== undefined) {
      since = new Date(query.since);
      if (Number.isNaN(since.getTime())) throw new ValidationError('Invalid "since"');
    }
    const page = await this.deps.repo.listRuns(workspaceId, {
      since,
      agentId: query.agent_id,
      repo: query.repo,
      status: query.status,
      cursor: query.cursor ? decodeCursor(query.cursor) : null,
      limit: query.limit ?? DEFAULT_RUNS_LIMIT,
    });
    const items = page.rows.map(({ run, agentDeleted, localPr }) => ({
      id: run.id,
      repo: run.repoFullName,
      pr_number: run.prNumber,
      local_pr: localPr ? { repo_id: localPr.repoId, number: localPr.number } : null,
      agent_id: run.agentId,
      agent_name: run.agentName,
      agent_deleted: agentDeleted,
      verdict: toVerdict(run),
      status: run.status ?? ('error' as const),
      findings_count: run.findingsCount,
      cost_usd: run.costUsd,
      duration_ms: run.durationMs,
      ran_at: (run.ranAt ?? new Date(0)).toISOString(),
      job_url: run.githubUrl,
    }));
    const last = page.rows[page.rows.length - 1]?.run;
    return {
      items,
      next_cursor: page.hasMore && last ? encodeCursor({ ranAt: last.ranAt ?? new Date(0), id: last.id }) : null,
    };
  }
}

function toVerdict(run: CiRunRow) {
  const p = Verdict.safeParse(run.verdict);
  return p.success ? p.data : null;
}

function toInstallation(row: CiInstallationRow): CiInstallation {
  return {
    id: row.id,
    agent_id: row.agentId,
    repo: row.repo,
    repo_id: row.repoId,
    target_type: row.targetType,
    mode: row.mode,
    exported_agent_version: row.exportedAgentVersion,
    exported_ci_fail_on: row.exportedCiFailOn,
    workflow_version: row.workflowVersion,
    runner_version: row.runnerVersion,
    triggers: z.array(CiTrigger).catch([]).parse(row.triggers),
    post_as: row.postAs,
    pr_number: row.prNumber,
    pr_url: row.prUrl,
    installed_at: row.installedAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function encodeCursor(c: RunsCursor): string {
  return Buffer.from(JSON.stringify({ t: c.ranAt.toISOString(), id: c.id }), 'utf8').toString('base64url');
}

const CursorPayload = z.object({ t: z.string().datetime(), id: z.string().uuid() });

/** The cursor is opaque to clients; a forged one is a 422, never a crash. */
function decodeCursor(raw: string): RunsCursor {
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new ValidationError('Invalid cursor');
  }
  const parsed = CursorPayload.safeParse(json);
  if (!parsed.success) throw new ValidationError('Invalid cursor');
  return { ranAt: new Date(parsed.data.t), id: parsed.data.id };
}
