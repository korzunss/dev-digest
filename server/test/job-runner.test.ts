import { describe, it, expect, afterEach } from 'vitest';
import { JobRunner } from '../src/platform/jobs.js';
import type { Db } from '../src/db/client.js';

/** Just enough of the Drizzle builder chain for JobRunner's insert/update calls. */
function fakeDb(): Db {
  const chain = {
    values: () => chain,
    set: () => chain,
    where: async () => undefined,
    returning: async () => [{ id: 'job-1' }],
  };
  return { insert: () => chain, update: () => chain } as unknown as Db;
}

describe('JobRunner', () => {
  const seen: unknown[] = [];
  const onRejection = (reason: unknown) => seen.push(reason);
  afterEach(() => {
    process.off('unhandledRejection', onRejection);
    seen.length = 0;
  });

  it('a failed job nobody awaits is not an unhandled rejection', async () => {
    // Every caller (clone, index, refresh) ignores `done`. Its rejection used to
    // escape as an unhandled rejection: a crash under Node's default mode, and a
    // failed `.it` run when a job hit a Postgres already stopped by afterAll.
    process.on('unhandledRejection', onRejection);
    const jobs = new JobRunner(fakeDb(), { retries: 0 });
    jobs.register('boom', async () => {
      throw new Error('handler failed');
    });

    await jobs.enqueue('ws', 'boom', {});
    await jobs.onIdle();
    await new Promise((r) => setTimeout(r, 0));

    expect(seen).toEqual([]);
  });

  it('still rejects `done` for a caller that awaits it', async () => {
    const jobs = new JobRunner(fakeDb(), { retries: 0 });
    jobs.register('boom', async () => {
      throw new Error('handler failed');
    });

    const { done } = await jobs.enqueue('ws', 'boom', {});
    await expect(done).rejects.toThrow('handler failed');
  });
});
