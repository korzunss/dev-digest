import type { EvalCaseResult, EvalExpectation, LLMProvider, UnifiedDiff } from '@devdigest/shared';
import { describeJobError } from './replay.js';
import { scoreCase } from './pipeline-scoring.js';
import type { EvalAgentSnapshot, ReviewFn, ReviewParams } from './types.js';

export interface CaseRunnerDeps {
  review: ReviewFn;
  parseDiff: (raw: string) => UnifiedDiff;
  callOptions: Pick<
    ReviewParams,
    'callDeadlineMs' | 'maxOutputTokens' | 'routing' | 'retryRouting' | 'maxSkippedChunkFraction'
  >;
  countTokens?: (s: string) => number;
  estimateCost?: (model: string, tokensIn: number, tokensOut: number) => number | null;
  now: () => Date;
}

/**
 * Run one suite case: one model call through the same review engine, with only
 * the agent's prompt, model, strategy and enabled skills (AC-29). No repo
 * context, callers, intent or PR text is sent. Never throws: a failure becomes
 * an `errored` result with a redacted one-line reason (AC-32).
 */
export async function runCase(
  snapshot: EvalAgentSnapshot,
  llm: LLMProvider,
  input: { diff: string },
  expected: readonly EvalExpectation[],
  deps: CaseRunnerDeps,
): Promise<EvalCaseResult> {
  const startedAt = deps.now();
  const mustFindTotal = expected.filter((e) => e.expect === 'must_find').length;
  const finish = (
    partial: Omit<EvalCaseResult, 'ran_at' | 'agent_version' | 'skill_version' | 'model' | 'duration_ms'>,
  ): EvalCaseResult => ({
    ...partial,
    duration_ms: Math.max(0, Math.round(deps.now().getTime() - startedAt.getTime())),
    ran_at: startedAt.toISOString(),
    model: snapshot.model,
    // The version belongs to the owner: a skill case run tags `skill_version` only (AC-88).
    ...(snapshot.owner === 'skill' ? { skill_version: snapshot.version } : { agent_version: snapshot.version }),
  });

  try {
    const diff = deps.parseDiff(input.diff);
    const outcome = await deps.review({
      systemPrompt: snapshot.systemPrompt,
      model: snapshot.model,
      diff,
      llm,
      strategy: snapshot.strategy,
      ...(snapshot.rendered.length > 0 ? { skills: snapshot.rendered } : {}),
      ...(deps.countTokens ? { countTokens: deps.countTokens } : {}),
      ...(deps.estimateCost ? { estimateCost: deps.estimateCost } : {}),
      ...deps.callOptions,
      requireParameters: true,
    });
    const kept = outcome.review.findings;
    const score = scoreCase({ expected, kept, droppedCount: outcome.dropped.length });
    return finish({
      status: score.status,
      expected_count: score.expected_count,
      actual_count: score.actual_count,
      must_find_total: score.must_find_total,
      must_find_matched: score.must_find_matched,
      noise: score.noise,
      kept: score.kept,
      dropped: score.dropped,
      cost_usd: outcome.costUsd,
      error: null,
      findings: kept.map((f) => ({
        file: f.file,
        start_line: f.start_line,
        end_line: f.end_line,
        title: f.title,
        severity: f.severity,
      })),
    });
  } catch (err) {
    return finish({
      status: 'errored',
      expected_count: expected.length,
      actual_count: 0,
      must_find_total: mustFindTotal,
      must_find_matched: 0,
      noise: 0,
      kept: 0,
      dropped: 0,
      cost_usd: null,
      error: describeJobError(err),
      findings: [],
    });
  }
}
