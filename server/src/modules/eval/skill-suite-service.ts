import { randomUUID } from 'node:crypto';
import type {
  EvalCaseResult,
  EvalCaseSaveBody,
  EvalModelPick,
  EvalSkillDraftRunBody,
  EvalSkillRunState,
  EvalDraftRunResult,
  EvalSuiteCase,
  LLMProvider,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { EVAL_CASE_CONCURRENCY, EVAL_DRAFT_TOKEN_TTL_MS, EVAL_MAX_SUITE_CASES } from './constants.js';
import {
  isUniqueViolation,
  pool,
  refusalError,
  resolveProvider,
  skillRunTokenHash,
  skillSnapshot,
  validateCase,
} from './pipeline-helpers.js';
import { runCase, type CaseRunnerDeps } from './pipeline-runner.js';
import { parseExpected, toCaseDto } from './pipeline-views.js';
import type { SuiteCaseRow } from './repository/pipeline.repo.js';
import type { EvalAgentSnapshot, EvalSkill, EvalSkillSuiteServiceDeps } from './types.js';

interface DraftToken {
  hash: string;
  result: EvalCaseResult;
  pick: EvalModelPick;
  expiresAt: number;
}

/**
 * Skill suites (plan 35): saved cases per skill, draft and single-case runs and
 * the background "Run all evals". A skill has no model of its own, so every run
 * carries a provider/model pick. Results live on the case only (AC-88): there are
 * no run rows, and progress is in memory.
 *
 * Paid side effects start only from here, always after the key check (AC-79).
 * A disabled skill still runs its own suite (AC-93).
 */
export class EvalSkillSuiteService {
  /** Skills with a suite run in this process, and how far each is. */
  private readonly inFlight = new Map<string, { done: number; total: number }>();
  /** Draft-run results that can be attached at Save; in memory, lost on restart. */
  private readonly tokens = new Map<string, DraftToken>();

  constructor(private readonly deps: EvalSkillSuiteServiceDeps) {}

  private get runner(): CaseRunnerDeps {
    const { review, parseDiff, callOptions, countTokens, estimateCost, now } = this.deps;
    return { review, parseDiff, callOptions, countTokens, estimateCost, now };
  }

  private async skill(workspaceId: string, skillId: string): Promise<EvalSkill> {
    const skill = await this.deps.skills.getById(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  }

  // ===========================================================================
  // Cases
  // ===========================================================================

  async listCases(workspaceId: string, skillId: string): Promise<EvalSuiteCase[]> {
    await this.skill(workspaceId, skillId);
    return (await this.deps.repo.listCases(workspaceId, { skillId })).map(toCaseDto);
  }

  async createCase(workspaceId: string, skillId: string, body: EvalCaseSaveBody): Promise<EvalSuiteCase> {
    const skill = await this.skill(workspaceId, skillId);
    // The token is single-use: consumed here whatever the outcome below.
    const token = body.draft_run_token ? this.takeToken(body.draft_run_token) : null;

    if ((await this.deps.repo.countCases(workspaceId, { skillId })) >= EVAL_MAX_SUITE_CASES) {
      throw new AppError('suite_too_large', `A suite holds at most ${EVAL_MAX_SUITE_CASES} cases.`, 422);
    }

    const checked = validateCase({
      diff: body.input.diff,
      expected: body.expected_output,
      name: body.name,
      takenNames: await this.deps.repo.caseNames(workspaceId, { skillId }),
      parseDiff: this.deps.parseDiff,
    });
    if (!checked.ok) throw refusalError(checked);

    // The result attaches only when input, current skill version and pick all match the run.
    let lastResult: EvalCaseResult | null = null;
    if (token) {
      const hash = skillRunTokenHash({
        diff: body.input.diff,
        expected: checked.expected,
        skillId,
        version: skill.version,
        provider: token.pick.provider,
        model: token.pick.model,
      });
      if (hash === token.hash) lastResult = token.result;
    }

    let row: SuiteCaseRow;
    try {
      row = await this.deps.repo.insertCase({
        workspaceId,
        agentId: null,
        skillId,
        name: body.name.trim(),
        inputDiff: body.input.diff,
        inputFiles: checked.files,
        inputMeta: body.input.pr_meta ?? null,
        expected: checked.expected,
        sourceFindingId: null,
        sourcePrId: null,
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      throw refusalError({ code: 'name_taken', message: `The name "${body.name.trim()}" is already used in this suite.` });
    }
    if (lastResult) {
      await this.deps.repo.setLastResult(workspaceId, row.id, lastResult);
      row = (await this.deps.repo.getCase(workspaceId, row.id)) ?? row;
    }
    return toCaseDto(row);
  }

  // ===========================================================================
  // Draft + single-case runs (synchronous, one model call)
  // ===========================================================================

  /** Run an unsaved draft on a pick. Persists nothing; hands back a token that Save can attach. */
  async draftRun(workspaceId: string, skillId: string, body: EvalSkillDraftRunBody): Promise<EvalDraftRunResult> {
    const skill = await this.skill(workspaceId, skillId);
    const pick: EvalModelPick = { provider: body.provider, model: body.model };
    const llm = await resolveProvider(this.deps.llm, pick.provider);
    const checked = validateCase({
      diff: body.input.diff,
      expected: body.expected_output,
      name: 'draft',
      takenNames: [],
      parseDiff: this.deps.parseDiff,
    });
    if (!checked.ok) throw refusalError(checked);

    const result = await runCase(skillSnapshot(skill, pick), llm, { diff: body.input.diff }, checked.expected, this.runner);
    const token = randomUUID();
    this.storeToken(token, {
      hash: skillRunTokenHash({
        diff: body.input.diff,
        expected: checked.expected,
        skillId,
        version: skill.version,
        provider: pick.provider,
        model: pick.model,
      }),
      result,
      pick,
      expiresAt: this.deps.now().getTime() + EVAL_DRAFT_TOKEN_TTL_MS,
    });
    return { result, run_token: token };
  }

  /**
   * Run one saved skill case on a pick and store the result on it. Allowed while a
   * suite run of the same skill is in progress (TQ3).
   */
  async runSavedCase(workspaceId: string, row: SuiteCaseRow, pick: EvalModelPick): Promise<EvalSuiteCase> {
    if (!row.skillId) throw new NotFoundError('Case not found');
    const skill = await this.skill(workspaceId, row.skillId);
    const llm = await resolveProvider(this.deps.llm, pick.provider);
    const result = await runCase(skillSnapshot(skill, pick), llm, { diff: row.inputDiff }, parseExpected(row.expected), this.runner);
    await this.deps.repo.setLastResult(workspaceId, row.id, result);
    const fresh = await this.deps.repo.getCase(workspaceId, row.id);
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
  // Suite run (background, progress in memory)
  // ===========================================================================

  /**
   * Start "Run all evals" of the skill on a pick. Returns the state at once; the
   * cases run in the background, three at a time, each result stored on its case.
   */
  async startSuiteRun(workspaceId: string, skillId: string, pick: EvalModelPick): Promise<EvalSkillRunState> {
    // The guard goes in BEFORE the first await, so two requests cannot both pass it.
    if (this.inFlight.has(skillId)) {
      throw new AppError('run_in_progress', 'A suite run of this skill is already in progress.', 409);
    }
    this.inFlight.set(skillId, { done: 0, total: 0 });
    let launched = false;
    try {
      const skill = await this.skill(workspaceId, skillId);
      const cases = await this.deps.repo.listCases(workspaceId, { skillId });
      if (cases.length === 0) throw new AppError('suite_empty', 'The suite has no cases.', 422);
      if (cases.length > EVAL_MAX_SUITE_CASES) {
        throw new AppError('suite_too_large', `A suite holds at most ${EVAL_MAX_SUITE_CASES} cases.`, 422);
      }
      const llm = await resolveProvider(this.deps.llm, pick.provider);
      const progress = { done: 0, total: cases.length };
      this.inFlight.set(skillId, progress);
      launched = true;
      void this.executeSuite(workspaceId, skillSnapshot(skill, pick), llm, cases, progress).finally(() =>
        this.inFlight.delete(skillId),
      );
      return this.stateOf(skill, { ...progress }, pick);
    } finally {
      if (!launched) this.inFlight.delete(skillId);
    }
  }

  private async executeSuite(
    workspaceId: string,
    snap: EvalAgentSnapshot,
    llm: LLMProvider,
    cases: readonly SuiteCaseRow[],
    progress: { done: number; total: number },
  ): Promise<void> {
    try {
      await pool(
        EVAL_CASE_CONCURRENCY,
        cases.map((c) => async () => {
          // runCase never throws: a failure becomes an `errored` result, so the rest continue.
          const result = await runCase(snap, llm, { diff: c.inputDiff }, parseExpected(c.expected), this.runner);
          await this.deps.repo.setLastResult(workspaceId, c.id, result);
          progress.done += 1;
        }),
      );
    } catch {
      // A storage failure ends the background run; finished cases keep their results.
    }
  }

  /** The skill, the progress of its running suite (or null) and the default pick. */
  async runState(workspaceId: string, skillId: string): Promise<EvalSkillRunState> {
    const skill = await this.skill(workspaceId, skillId);
    const progress = this.inFlight.get(skillId);
    return this.stateOf(skill, progress ? { ...progress } : null, await this.deps.skills.defaultPick(workspaceId, skillId));
  }

  private stateOf(
    skill: EvalSkill,
    progress: { done: number; total: number } | null,
    pick: EvalModelPick | null,
  ): EvalSkillRunState {
    return {
      skill: { id: skill.id, name: skill.name, version: skill.version, enabled: skill.enabled },
      progress,
      default_pick: pick,
    };
  }
}
