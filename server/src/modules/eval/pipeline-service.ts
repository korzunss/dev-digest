import { randomUUID } from 'node:crypto';
import type {
  EvalAgentDetail,
  EvalCaseResult,
  EvalCaseSaveBody,
  EvalCompare,
  EvalDashboardView,
  EvalDraftRunBody,
  EvalDraftRunResult,
  EvalDraftSeed,
  EvalExpectation,
  EvalPeriod,
  EvalPromoteResult,
  EvalRunAllPreview,
  EvalModelPick,
  EvalRunAllResult,
  EvalSkillRunAgentsPreview,
  EvalSuiteCase,
  EvalSuiteRun,
  EvalSuiteRunDetail,
  LLMProvider,
} from '@devdigest/shared';
import { AppError, ConfigError, NotFoundError, ValidationError } from '../../platform/errors.js';
import {
  EVAL_CASE_CONCURRENCY,
  EVAL_DRAFT_TOKEN_TTL_MS,
  EVAL_MAX_SUITE_CASES,
  EVAL_RECENT_RUNS,
} from './constants.js';
import {
  caseName,
  isUniqueViolation,
  pool,
  refusalError,
  resolveProvider,
  runTokenHash,
  seedExpectation,
  validateCase,
} from './pipeline-helpers.js';
import { runCase, type CaseRunnerDeps } from './pipeline-runner.js';
import { aggregateRun, type CaseScore } from './pipeline-scoring.js';
import {
  buildAgentDetail,
  buildCompare,
  buildDashboard,
  parseExpected,
  parseSkills,
  toCaseDto,
  toRunDetail,
  toRunDto,
} from './pipeline-views.js';
import type { SuiteCaseRow, SuiteRunRow } from './repository/pipeline.repo.js';
import type { EvalAgentSnapshot, EvalPipelineServiceDeps } from './types.js';

const DAY_MS = 86_400_000;

interface DraftToken {
  hash: string;
  result: EvalCaseResult;
  expiresAt: number;
}

/**
 * Eval pipeline service (plan 34): saved suite cases per agent, draft and
 * single-case runs, background suite runs, and the read models on top of them.
 * Depends on narrow ports only (`EvalPipelineServiceDeps`); the container wires
 * the agents, reviews and skills services behind them.
 *
 * Paid side effects (model calls) start only from here, always after the key
 * check (AC-79), and a case run reads nothing but its frozen input (AC-29).
 */
export class EvalPipelineService {
  /** Agents with a suite run in this process; the DB check covers other writers. */
  private readonly inFlight = new Set<string>();
  /** Draft-run results that can be attached at Save; in memory, lost on restart. */
  private readonly tokens = new Map<string, DraftToken>();

  constructor(private readonly deps: EvalPipelineServiceDeps) {}

  private get runner(): CaseRunnerDeps {
    const { review, parseDiff, callOptions, countTokens, estimateCost, matchesPath, now } = this.deps;
    return { review, parseDiff, callOptions, countTokens, estimateCost, matchesPath, now };
  }

  // ===========================================================================
  // Shared guards
  // ===========================================================================

  /** The agent exactly as one run sees it: current version, enabled skills only. */
  private async snapshot(
    workspaceId: string,
    agentId: string,
  ): Promise<EvalAgentSnapshot & { name: string }> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const skills = (await this.deps.agents.skillsFor(agentId)).filter((s) => s.enabled);
    return {
      id: agent.id,
      name: agent.name,
      provider: agent.provider,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      strategy: agent.strategy,
      version: agent.version,
      skills: skills.map((s) => ({ id: s.id, name: s.name, version: s.version })),
      rendered: skills.map((s) => s.rendered),
      scoped: skills.map((s) => ({ id: s.id, name: s.name, version: s.version, body: s.rendered, paths: s.paths })),
    };
  }

  /** The provider client, or a `no_api_key` refusal. Called before anything is created or spent. */
  private providerFor(provider: EvalAgentSnapshot['provider']): Promise<LLMProvider> {
    return resolveProvider(this.deps.llm, provider);
  }

  private erroredResult(snapshot: EvalAgentSnapshot, expected: readonly EvalExpectation[], reason: string): EvalCaseResult {
    return {
      status: 'errored',
      expected_count: expected.length,
      actual_count: 0,
      must_find_total: expected.filter((e) => e.expect === 'must_find').length,
      must_find_matched: 0,
      noise: 0,
      kept: 0,
      dropped: 0,
      duration_ms: 0,
      cost_usd: null,
      error: reason,
      ran_at: this.deps.now().toISOString(),
      agent_version: snapshot.version,
      model: snapshot.model,
      findings: [],
    };
  }

  // ===========================================================================
  // Cases
  // ===========================================================================

  async listCases(workspaceId: string, agentId: string): Promise<EvalSuiteCase[]> {
    if (!(await this.deps.agents.getById(workspaceId, agentId))) throw new NotFoundError('Agent not found');
    return (await this.deps.repo.listCases(workspaceId, { agentId })).map(toCaseDto);
  }

  /** The draft for a finding, or the case already saved for it. Writes nothing. */
  async seedDraft(workspaceId: string, findingId: string): Promise<EvalDraftSeed> {
    const src = await this.deps.reviews.findingSource(workspaceId, findingId);
    const kind = src.finding.accepted ? 'accepted' : src.finding.dismissed ? 'dismissed' : null;
    if (!kind) {
      throw new AppError('finding_undecided', 'Accept or dismiss the finding first.', 409);
    }
    const agent = src.agentId ? await this.deps.agents.getById(workspaceId, src.agentId) : undefined;
    if (!agent) {
      throw new AppError('agent_missing', 'The agent that produced this finding no longer exists.', 409);
    }
    const saved = await this.deps.repo.caseBySourceFinding(workspaceId, findingId);
    if (saved) return { kind: 'existing', case: toCaseDto(saved) };
    if (src.fileDiff === null || src.fileDiff.trim() === '') {
      throw new AppError('no_diff_text', `no diff text available for ${src.finding.file}`, 422);
    }
    const taken = await this.deps.repo.caseNames(workspaceId, { agentId: agent.id });
    return {
      kind: 'draft',
      draft: {
        agent_id: agent.id,
        agent_name: agent.name,
        provider: agent.provider,
        model: agent.model,
        name: caseName(kind, src.finding.title, taken),
        input: {
          diff: src.fileDiff,
          files: this.deps.parseDiff(src.fileDiff).files.map((f) => f.path),
          pr_meta: {
            repo_id: src.pr.repo_id,
            repo: src.pr.repo,
            pr_number: src.pr.number,
            title: src.pr.title,
            head_sha: src.pr.head_sha,
          },
        },
        expected: [seedExpectation(src.finding, kind)],
        source: {
          finding_id: src.finding.id,
          pr_id: src.pr.id,
          repo_id: src.pr.repo_id,
          pr_number: src.pr.number,
        },
        seeded_from: kind,
      },
    };
  }

  async createCase(workspaceId: string, agentId: string, body: EvalCaseSaveBody): Promise<EvalSuiteCase> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    // The token is single-use: consumed here whatever the outcome below.
    const token = body.draft_run_token ? this.takeToken(body.draft_run_token) : null;

    if ((await this.deps.repo.countCases(workspaceId, { agentId })) >= EVAL_MAX_SUITE_CASES) {
      throw new AppError('suite_too_large', `A suite holds at most ${EVAL_MAX_SUITE_CASES} cases.`, 422);
    }

    let sourcePrId: string | null = null;
    if (body.source_finding_id) {
      const ref = await this.deps.reviews.findingRef(workspaceId, body.source_finding_id);
      sourcePrId = ref.pr.id;
      const existing = await this.deps.repo.caseBySourceFinding(workspaceId, body.source_finding_id);
      if (existing) throw this.caseExists(existing.id);
    }

    const checked = validateCase({
      diff: body.input.diff,
      expected: body.expected_output,
      name: body.name,
      takenNames: await this.deps.repo.caseNames(workspaceId, { agentId }),
      parseDiff: this.deps.parseDiff,
    });
    if (!checked.ok) throw refusalError(checked);

    let lastResult: EvalCaseResult | null = null;
    if (token) {
      const snap = await this.snapshot(workspaceId, agentId);
      const hash = runTokenHash({
        diff: body.input.diff,
        expected: checked.expected,
        agentId,
        version: snap.version,
        skills: snap.skills,
      });
      if (hash === token.hash) lastResult = token.result;
    }

    let row: SuiteCaseRow;
    try {
      row = await this.deps.repo.insertCase({
        workspaceId,
        agentId,
        skillId: null,
        name: body.name.trim(),
        inputDiff: body.input.diff,
        inputFiles: checked.files,
        inputMeta: body.input.pr_meta ?? null,
        expected: checked.expected,
        sourceFindingId: body.source_finding_id ?? null,
        sourcePrId,
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // A race with another save: the unique indexes decide.
      const existing = body.source_finding_id
        ? await this.deps.repo.caseBySourceFinding(workspaceId, body.source_finding_id)
        : null;
      if (existing) throw this.caseExists(existing.id);
      throw refusalError({ code: 'name_taken', message: `The name "${body.name.trim()}" is already used in this suite.` });
    }
    if (lastResult) {
      await this.deps.repo.setLastResult(workspaceId, row.id, lastResult);
      row = (await this.deps.repo.getCase(workspaceId, row.id)) ?? row;
    }
    return toCaseDto(row);
  }

  private caseExists(caseId: string): AppError {
    return new AppError('case_exists', 'A case for this finding is already saved.', 409, { case_id: caseId });
  }

  /** Edit a case. Its last result is cleared by the repository (it no longer describes the case). */
  async updateCase(
    workspaceId: string,
    caseId: string,
    body: Pick<EvalCaseSaveBody, 'name' | 'input' | 'expected_output'>,
  ): Promise<EvalSuiteCase> {
    const current = await this.deps.repo.getCase(workspaceId, caseId);
    if (!current) throw new NotFoundError('Case not found');
    const names = await this.deps.repo.caseNames(workspaceId, this.deps.repo.ownerOf(current));
    const checked = validateCase({
      diff: body.input.diff,
      expected: body.expected_output,
      name: body.name,
      takenNames: names.filter((n) => n !== current.name),
      parseDiff: this.deps.parseDiff,
    });
    if (!checked.ok) throw refusalError(checked);
    try {
      const row = await this.deps.repo.updateCase(workspaceId, caseId, {
        name: body.name.trim(),
        inputDiff: body.input.diff,
        inputFiles: checked.files,
        inputMeta: body.input.pr_meta ?? null,
        expected: checked.expected,
      });
      if (!row) throw new NotFoundError('Case not found');
      return toCaseDto(row);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      throw refusalError({ code: 'name_taken', message: `The name "${body.name.trim()}" is already used in this suite.` });
    }
  }

  /** Delete a case and, by cascade, its per-case results; past runs keep their metrics. */
  async deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    return this.deps.repo.deleteCase(workspaceId, caseId);
  }

  // ===========================================================================
  // Draft + single-case runs (synchronous, one model call)
  // ===========================================================================

  /** Run an unsaved draft. Persists nothing; hands back a token that Save can attach. */
  async draftRun(workspaceId: string, agentId: string, body: EvalDraftRunBody): Promise<EvalDraftRunResult> {
    const snap = await this.snapshot(workspaceId, agentId);
    const llm = await this.providerFor(snap.provider);
    const checked = validateCase({
      diff: body.input.diff,
      expected: body.expected_output,
      name: 'draft',
      takenNames: [],
      parseDiff: this.deps.parseDiff,
    });
    if (!checked.ok) throw refusalError(checked);

    const result = await runCase(snap, llm, { diff: body.input.diff }, checked.expected, this.runner);
    const token = randomUUID();
    this.storeToken(token, {
      hash: runTokenHash({
        diff: body.input.diff,
        expected: checked.expected,
        agentId,
        version: snap.version,
        skills: snap.skills,
      }),
      result,
      expiresAt: this.deps.now().getTime() + EVAL_DRAFT_TOKEN_TTL_MS,
    });
    return { result, run_token: token };
  }

  /**
   * Run one saved case on its frozen input and store the result on it. Not a suite run.
   * A skill case needs a provider/model `pick` and is run by the skill suite service;
   * an agent case ignores `pick` (it runs on the agent's own model).
   */
  async runSavedCase(workspaceId: string, caseId: string, pick?: EvalModelPick): Promise<EvalSuiteCase> {
    const row = await this.deps.repo.getCase(workspaceId, caseId);
    if (!row) throw new NotFoundError('Case not found');
    if (!row.agentId) {
      if (!pick) {
        throw new ValidationError('A skill case needs a provider and model.', [
          { field: 'model', message: 'Pick a provider and model to run a skill case.' },
        ]);
      }
      return this.deps.skillCases.runSavedCase(workspaceId, row, pick);
    }
    const snap = await this.snapshot(workspaceId, row.agentId);
    const llm = await this.providerFor(snap.provider);
    const expected = parseExpected(row.expected);
    const result = await runCase(snap, llm, { diff: row.inputDiff }, expected, this.runner);
    await this.deps.repo.setLastResult(workspaceId, caseId, result);
    const fresh = await this.deps.repo.getCase(workspaceId, caseId);
    if (!fresh) throw new NotFoundError('Case not found');
    return toCaseDto(fresh);
  }

  private storeToken(token: string, entry: DraftToken): void {
    const nowMs = this.deps.now().getTime();
    for (const [key, value] of this.tokens) {
      if (value.expiresAt <= nowMs) this.tokens.delete(key);
    }
    this.tokens.set(token, entry);
  }

  /** Remove and return a token's entry when it is still valid. */
  private takeToken(token: string): DraftToken | null {
    const entry = this.tokens.get(token);
    this.tokens.delete(token);
    if (!entry || entry.expiresAt <= this.deps.now().getTime()) return null;
    return entry;
  }

  // ===========================================================================
  // Suite runs (background)
  // ===========================================================================

  /**
   * Start a suite run of the agent's current version. Returns the `running` run
   * at once; the cases run in the background, three at a time.
   */
  async startSuiteRun(workspaceId: string, agentId: string): Promise<EvalSuiteRun> {
    // The guard goes in BEFORE the first await, so two requests cannot both pass it.
    if (this.inFlight.has(agentId)) {
      throw new AppError('run_in_progress', 'A suite run of this agent is already in progress.', 409);
    }
    this.inFlight.add(agentId);
    let launched = false;
    try {
      if (await this.deps.repo.hasRunning(agentId)) {
        throw new AppError('run_in_progress', 'A suite run of this agent is already in progress.', 409);
      }
      const snap = await this.snapshot(workspaceId, agentId);
      const cases = await this.deps.repo.listCases(workspaceId, { agentId });
      if (cases.length === 0) throw new AppError('suite_empty', 'The suite has no cases.', 422);
      if (cases.length > EVAL_MAX_SUITE_CASES) {
        throw new AppError('suite_too_large', `A suite holds at most ${EVAL_MAX_SUITE_CASES} cases.`, 422);
      }
      const llm = await this.providerFor(snap.provider);
      const run = await this.deps.repo.insertRun({
        workspaceId,
        agentId,
        agentVersion: snap.version,
        provider: snap.provider,
        model: snap.model,
        skills: snap.skills,
        casesTotal: cases.length,
      });
      launched = true;
      void this.executeSuite(run, snap, llm, cases).finally(() => this.inFlight.delete(agentId));
      return toRunDto(run, snap.name);
    } finally {
      if (!launched) this.inFlight.delete(agentId);
    }
  }

  private async executeSuite(
    run: SuiteRunRow,
    snap: EvalAgentSnapshot,
    llm: LLMProvider,
    cases: readonly SuiteCaseRow[],
  ): Promise<void> {
    const scores: CaseScore[] = [];
    let errored = 0;
    let cost = 0;
    let anyCost = false;
    const finish = (result: EvalCaseResult): void => {
      if (result.cost_usd !== null) {
        cost += result.cost_usd;
        anyCost = true;
      }
      if (result.status === 'errored') {
        errored += 1;
        return;
      }
      scores.push({
        status: result.status,
        expected_count: result.expected_count,
        actual_count: result.actual_count,
        must_find_total: result.must_find_total,
        must_find_matched: result.must_find_matched,
        noise: result.noise,
        kept: result.kept,
        dropped: result.dropped,
      });
    };

    try {
      await pool(
        EVAL_CASE_CONCURRENCY,
        cases.map((c) => async () => {
          const expected = parseExpected(c.expected);
          const result = Array.isArray(c.expected) && expected.length === c.expected.length
            ? await runCase(snap, llm, { diff: c.inputDiff }, expected, this.runner)
            : this.erroredResult(snap, expected, 'The stored expected output is invalid.');
          await this.deps.repo.recordCaseResult(run.id, {
            caseId: c.id,
            caseName: c.name,
            result,
            status: result.status,
          });
          finish(result);
        }),
      );
      const agg = aggregateRun(scores, errored);
      await this.deps.repo.completeRun(run.id, {
        status: agg.status,
        recall: agg.metrics.recall,
        precision: agg.metrics.precision,
        citationAccuracy: agg.metrics.citation_accuracy,
        costUsd: anyCost ? cost : null,
      });
    } catch {
      // A crash must not leave the run `running` for ever.
      await this.deps.repo
        .completeRun(run.id, {
          status: 'failed',
          recall: null,
          precision: null,
          citationAccuracy: null,
          costUsd: anyCost ? cost : null,
        })
        .catch(() => undefined);
    }
  }

  /** Enabled agents with at least one case, and which of them would be skipped. */
  async runAllPreview(workspaceId: string, only?: ReadonlySet<string>): Promise<EvalRunAllPreview> {
    const out: EvalRunAllPreview = { agents: [], total_cases: 0, skipped: [] };
    for (const agent of await this.deps.agents.listAll(workspaceId)) {
      if (!agent.enabled || (only && !only.has(agent.id))) continue;
      const cases = await this.deps.repo.countCases(workspaceId, { agentId: agent.id });
      if (cases === 0) continue;
      if (this.inFlight.has(agent.id) || (await this.deps.repo.hasRunning(agent.id))) {
        out.skipped.push({ agent_id: agent.id, name: agent.name, provider: agent.provider, reason: 'run_in_progress' });
        continue;
      }
      try {
        await this.deps.llm(agent.provider);
      } catch (err) {
        if (!(err instanceof ConfigError)) throw err;
        out.skipped.push({ agent_id: agent.id, name: agent.name, provider: agent.provider, reason: 'no_api_key' });
        continue;
      }
      out.agents.push({ agent_id: agent.id, name: agent.name, model: agent.model, cases });
      out.total_cases += cases;
    }
    return out;
  }

  /** One suite run per enabled agent with cases; an agent that cannot start is skipped by name. */
  async runAll(workspaceId: string, only?: ReadonlySet<string>): Promise<EvalRunAllResult> {
    const out: EvalRunAllResult = { started: [], skipped: [] };
    for (const agent of await this.deps.agents.listAll(workspaceId)) {
      if (!agent.enabled || (only && !only.has(agent.id))) continue;
      if ((await this.deps.repo.countCases(workspaceId, { agentId: agent.id })) === 0) continue;
      try {
        const run = await this.startSuiteRun(workspaceId, agent.id);
        out.started.push({ agent_id: agent.id, run_id: run.id });
      } catch (err) {
        if (err instanceof AppError && (err.code === 'run_in_progress' || err.code === 'no_api_key')) {
          out.skipped.push({ agent_id: agent.id, name: agent.name, provider: agent.provider, reason: err.code });
          continue;
        }
        throw err;
      }
    }
    return out;
  }

  /** The ids of the agents a skill is attached to; 404 for an unknown skill. */
  private async agentsUsing(workspaceId: string, skillId: string) {
    const skill = await this.deps.skills.getById(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');
    const using = await this.deps.skills.agentsUsing(workspaceId, skillId);
    return { skill, ids: new Set(using.map((a) => a.id)) };
  }

  /** "Run on evals" preview: the skill's enabled agents with cases, or why nothing can run. */
  async runOnEvalsPreview(workspaceId: string, skillId: string): Promise<EvalSkillRunAgentsPreview> {
    const { skill, ids } = await this.agentsUsing(workspaceId, skillId);
    if (!skill.enabled) return { agents: [], total_cases: 0, skipped: [], blocked: 'skill_disabled' };
    const preview = await this.runAllPreview(workspaceId, ids);
    const nothing = preview.agents.length === 0 && preview.skipped.length === 0;
    return { ...preview, blocked: nothing ? 'no_agents' : null };
  }

  /** Suite runs of the agents using the skill; the skill state is re-checked here (edge: disabled while the confirm is open). */
  async runOnEvals(workspaceId: string, skillId: string): Promise<EvalRunAllResult> {
    const { skill, ids } = await this.agentsUsing(workspaceId, skillId);
    if (!skill.enabled) {
      throw new AppError('skill_disabled', 'Enable the skill to test it in agents.', 409);
    }
    const out = await this.runAll(workspaceId, ids);
    if (out.started.length === 0 && out.skipped.length === 0) {
      throw new AppError('no_agents', 'No enabled agent that uses this skill has eval cases.', 422);
    }
    return out;
  }

  /** Mark every `running` suite run failed; called once on boot (single-API assumption). */
  async reapStaleRuns(): Promise<number> {
    return this.deps.repo.reapRunning();
  }

  // ===========================================================================
  // Read models
  // ===========================================================================

  async getRun(workspaceId: string, runId: string): Promise<EvalSuiteRunDetail> {
    const run = await this.deps.repo.getRun(workspaceId, runId);
    if (!run) throw new NotFoundError('Run not found');
    const agent = await this.deps.agents.getById(workspaceId, run.agentId);
    return toRunDetail(run, agent?.name ?? '', await this.deps.repo.resultsForRun(run.id));
  }

  async agentDetail(workspaceId: string, agentId: string, period: EvalPeriod): Promise<EvalAgentDetail> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const [allRuns, casesTotal] = await Promise.all([
      this.deps.repo.listRuns(workspaceId, agentId, null),
      this.deps.repo.countCases(workspaceId, { agentId }),
    ]);
    return buildAgentDetail({
      agent,
      casesTotal,
      allRuns,
      since: period === '30d' ? new Date(this.deps.now().getTime() - 30 * DAY_MS) : null,
    });
  }

  async dashboard(workspaceId: string): Promise<EvalDashboardView> {
    const agents = await this.deps.agents.listAll(workspaceId);
    const rows = await Promise.all(
      agents.map(async (a) => ({
        id: a.id,
        name: a.name,
        model: a.model,
        enabled: a.enabled,
        casesTotal: await this.deps.repo.countCases(workspaceId, { agentId: a.id }),
        runs: await this.deps.repo.listRuns(workspaceId, a.id, null),
      })),
    );
    return buildDashboard({
      agents: rows,
      recentRuns: await this.deps.repo.recentRuns(workspaceId, EVAL_RECENT_RUNS),
      agentNames: new Map(agents.map((a) => [a.id, a.name])),
    });
  }

  async compare(workspaceId: string, runIdA: string, runIdB: string): Promise<EvalCompare> {
    const [a, b] = await Promise.all([
      this.deps.repo.getRun(workspaceId, runIdA),
      this.deps.repo.getRun(workspaceId, runIdB),
    ]);
    if (!a || !b) throw new NotFoundError('Run not found');
    if (a.id === b.id || a.agentId !== b.agentId) {
      throw new AppError('runs_not_comparable', 'Only two different runs of the same agent can be compared.', 422);
    }
    const agent = await this.deps.agents.getById(workspaceId, a.agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const [older, newer] = a.startedAt.getTime() <= b.startedAt.getTime() ? [a, b] : [b, a];
    const [olderCfg, newerCfg] = await Promise.all([
      this.deps.agents.versionConfig(agent.id, older.agentVersion),
      this.deps.agents.versionConfig(agent.id, newer.agentVersion),
    ]);
    const recorded = parseSkills(newer.skills).map((s) => s.id);
    return buildCompare({
      agentName: agent.name,
      older,
      newer,
      olderPrompt: promptOf(olderCfg),
      newerPrompt: promptOf(newerCfg),
      currentVersion: agent.version,
      existingSkillIds: new Set(await this.deps.agents.existingSkillIds(workspaceId, recorded)),
    });
  }

  /** Bring the config and skill set of a run's version back as a new agent version. */
  async promote(workspaceId: string, runId: string): Promise<EvalPromoteResult> {
    const run = await this.deps.repo.getRun(workspaceId, runId);
    if (!run) throw new NotFoundError('Run not found');
    const config = await this.deps.agents.versionConfig(run.agentId, run.agentVersion);
    if (!config) {
      throw new AppError(
        'version_config_missing',
        `The stored config of version ${run.agentVersion} is missing, so it cannot be promoted.`,
        422,
      );
    }
    const recorded = parseSkills(run.skills).map((s) => s.id);
    const existing = new Set(await this.deps.agents.existingSkillIds(workspaceId, recorded));
    const result = await this.deps.promote.promote(workspaceId, run.agentId, {
      config,
      skillIds: recorded.filter((id) => existing.has(id)),
      message: `Promoted v${run.agentVersion} from an eval run`,
    });
    return { agent_id: run.agentId, version: result.version };
  }
}

function promptOf(config: Record<string, unknown> | null): string | null {
  const prompt = config?.system_prompt;
  return typeof prompt === 'string' ? prompt : null;
}
