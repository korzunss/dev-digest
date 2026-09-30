import { describe, it, expect } from 'vitest';
import { RunBus } from '../src/platform/sse.js';

describe('RunBus abort signal', () => {
  it('cancel aborts a previously issued signal', () => {
    const bus = new RunBus();
    const signal = bus.signalFor('r1');
    expect(signal.aborted).toBe(false);
    bus.cancel('r1');
    expect(signal.aborted).toBe(true);
    expect(bus.isCancelled('r1')).toBe(true);
  });

  it('signalFor after cancel is already aborted', () => {
    const bus = new RunBus();
    bus.cancel('r2');
    expect(bus.signalFor('r2').aborted).toBe(true);
  });

  it('complete then signalFor returns a fresh, un-aborted signal', () => {
    const bus = new RunBus();
    const first = bus.signalFor('r3');
    bus.cancel('r3');
    bus.complete('r3');
    const next = bus.signalFor('r3');
    expect(first.aborted).toBe(true);
    expect(next).not.toBe(first);
    expect(next.aborted).toBe(false);
  });
});
