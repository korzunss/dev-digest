import type { ReviewRecord } from '@devdigest/shared';
import { ApiError } from './errors.js';
import type { Clock, DevDigestApi } from './ports.js';

export type RunOutcome =
  | { status: 'done'; runId: string; review: ReviewRecord }
  | { status: 'running'; runId: string }
  | { status: 'failed'; runId: string; error: string }
  | { status: 'cancelled'; runId: string };

export interface WaitOptions {
  budgetMs: number;
  pollMs: number;
}

/** Look at one run without triggering anything. `done` needs its review row; until it appears the run reads as `running`. */
export async function runStatus(api: DevDigestApi, pullId: string, runId: string): Promise<RunOutcome | null> {
  const run = (await api.listRuns(pullId)).find((r) => r.run_id === runId);
  if (!run) return null;
  if (run.status === 'failed') return { status: 'failed', runId, error: run.error ?? 'unknown error' };
  if (run.status === 'cancelled') return { status: 'cancelled', runId };
  if (run.status === 'done') {
    const review = (await api.listReviews(pullId)).find((r) => r.run_id === runId && r.kind === 'review');
    if (review) return { status: 'done', runId, review };
  }
  return { status: 'running', runId };
}

/** Trigger exactly one review, then poll within the budget. Over budget: `running` with the run id. */
export async function runAndWait(
  api: DevDigestApi,
  clock: Clock,
  target: { pullId: string; agentId: string },
  opts: WaitOptions,
): Promise<RunOutcome> {
  const triggered = await api.triggerReview(target.pullId, target.agentId);
  const first = triggered.runs[0];
  if (!first) throw new ApiError(0, 'no_run');
  const runId = first.run_id;
  const deadline = clock.now() + opts.budgetMs;

  while (clock.now() < deadline) {
    await clock.sleep(opts.pollMs);
    const outcome = await runStatus(api, target.pullId, runId);
    if (outcome && outcome.status !== 'running') return outcome;
  }
  return { status: 'running', runId };
}
