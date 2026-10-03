import { describe, it, expect } from 'vitest';
import { KeyedMutex } from '../src/adapters/git/clone-lock.js';

const defer = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 5));

describe('KeyedMutex', () => {
  it('runs same-key tasks one after another', async () => {
    const m = new KeyedMutex();
    const events: string[] = [];
    const gate = defer();
    const a = m.run('k', undefined, async () => {
      events.push('a:start');
      await gate.promise;
      events.push('a:end');
    });
    const b = m.run('k', undefined, async () => {
      events.push('b:start');
    });
    await tick();
    expect(events).toEqual(['a:start']);
    gate.resolve();
    await Promise.all([a, b]);
    expect(events).toEqual(['a:start', 'a:end', 'b:start']);
  });

  it('runs different keys concurrently', async () => {
    const m = new KeyedMutex();
    const gate = defer();
    let bRan = false;
    const a = m.run('x', undefined, () => gate.promise);
    await m.run('y', undefined, async () => {
      bRan = true;
    });
    expect(bRan).toBe(true);
    gate.resolve();
    await a;
  });

  it('an aborted waiter never runs and does not let its successor overlap the holder', async () => {
    const m = new KeyedMutex();
    const events: string[] = [];
    const gate = defer();
    const a = m.run('k', undefined, async () => {
      events.push('a:start');
      await gate.promise;
      events.push('a:end');
    });
    const ctrl = new AbortController();
    const reason = new Error('b gone');
    const b = m.run('k', ctrl.signal, async () => {
      events.push('b:start');
    });
    const bResult = expect(b).rejects.toBe(reason);
    const c = m.run('k', undefined, async () => {
      events.push('c:start');
    });
    await tick();
    ctrl.abort(reason);
    await bResult;
    await tick();
    expect(events).toEqual(['a:start']);
    gate.resolve();
    await Promise.all([a, c]);
    expect(events).toEqual(['a:start', 'a:end', 'c:start']);
  });

  it('releases the lock when fn throws', async () => {
    const m = new KeyedMutex();
    await expect(
      m.run('k', undefined, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await expect(m.run('k', undefined, async () => 'ok')).resolves.toBe('ok');
  });

  it('rejects a pre-aborted signal without running fn', async () => {
    const m = new KeyedMutex();
    const reason = new Error('early');
    let ran = false;
    await expect(
      m.run('k', AbortSignal.abort(reason), async () => {
        ran = true;
      }),
    ).rejects.toBe(reason);
    expect(ran).toBe(false);
  });
});
