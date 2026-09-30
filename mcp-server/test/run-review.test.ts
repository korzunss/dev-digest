import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/core/errors.js';
import { runAndWait, runStatus } from '../src/core/run-review.js';
import { fakeApi, fakeClock, makeReview, makeRun } from './fakes.js';

const target = { pullId: 'pull-1', agentId: 'agent-1' };
const opts = { budgetMs: 10_000, pollMs: 2_000 };
const triggers = (calls: string[]) => calls.filter((c) => c.startsWith('triggerReview')).length;

describe('runAndWait', () => {
  it('returns done with the review of the run', async () => {
    const api = fakeApi({
      runs: [[makeRun()], [makeRun({ status: 'done' })]],
      reviews: [makeReview({ id: 'other', run_id: 'run-x' }), makeReview({ id: 'mine' })],
    });
    const out = await runAndWait(api, fakeClock(), target, opts);
    expect(out).toMatchObject({ status: 'done', runId: 'run-1', review: { id: 'mine' } });
    expect(triggers(api.calls)).toBe(1);
  });

  it('returns running once the budget is spent', async () => {
    const api = fakeApi();
    const out = await runAndWait(api, fakeClock(), target, opts);
    expect(out).toEqual({ status: 'running', runId: 'run-1' });
    expect(triggers(api.calls)).toBe(1);
  });

  it('keeps polling when done but the review is not visible yet', async () => {
    const api = fakeApi({ runs: [[makeRun({ status: 'done' })]] });
    expect((await runAndWait(api, fakeClock(), target, opts)).status).toBe('running');
  });

  it('returns failed with the error, one trigger', async () => {
    const api = fakeApi({ runs: [[makeRun({ status: 'failed', error: 'bad key' })]] });
    expect(await runAndWait(api, fakeClock(), target, opts)).toEqual({
      status: 'failed',
      runId: 'run-1',
      error: 'bad key',
    });
    expect(triggers(api.calls)).toBe(1);
  });

  it('returns cancelled', async () => {
    const api = fakeApi({ runs: [[makeRun({ status: 'cancelled' })]] });
    expect((await runAndWait(api, fakeClock(), target, opts)).status).toBe('cancelled');
  });

  it('throws no_run when the trigger returns no run', async () => {
    const api = fakeApi({ triggerResponse: { pr_id: 'pull-1', runs: [], reviews: [] } });
    await expect(runAndWait(api, fakeClock(), target, opts)).rejects.toMatchObject({ code: 'no_run' });
    await expect(runAndWait(api, fakeClock(), target, opts)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('runStatus', () => {
  it('returns null for an unknown run and never triggers', async () => {
    const api = fakeApi();
    expect(await runStatus(api, 'pull-1', 'nope')).toBeNull();
    expect(triggers(api.calls)).toBe(0);
  });
});
