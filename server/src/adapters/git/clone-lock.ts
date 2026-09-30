/**
 * Per-key FIFO lock. A waiter whose signal aborts leaves the queue at once and
 * never runs, but the queue stays chained on the *holder*: the next waiter still
 * waits for the running task, so an abort can never let two tasks overlap.
 */
export class KeyedMutex {
  private tails = new Map<string, Promise<void>>();

  async run<T>(key: string, signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
    signal?.throwIfAborted();

    const prev = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prev.then(() => mine);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });

    try {
      await this.waitFor(prev, signal);
    } catch (err) {
      // Never ran: hand the slot on once the holder ahead of us has settled.
      void prev.then(release);
      throw err;
    }

    try {
      return await fn();
    } finally {
      release();
    }
  }

  private waitFor(prev: Promise<void>, signal: AbortSignal | undefined): Promise<void> {
    if (!signal) return prev;
    return new Promise<void>((resolve, reject) => {
      const onAbort = (): void => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      prev.then(
        () => {
          signal.removeEventListener('abort', onAbort);
          resolve();
        },
        (err: unknown) => {
          signal.removeEventListener('abort', onAbort);
          reject(err);
        },
      );
    });
  }
}
