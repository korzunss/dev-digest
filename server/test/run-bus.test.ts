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

  it('complete then signalFor returns an aborted signal that is not stored', () => {
    const bus = new RunBus();
    const first = bus.signalFor('r3');
    bus.cancel('r3');
    bus.complete('r3');
    const next = bus.signalFor('r3');
    expect(first.aborted).toBe(true);
    expect(next).not.toBe(first);
    expect(next.aborted).toBe(true);
    // Not stored: each call after complete gets its own signal.
    expect(bus.signalFor('r3')).not.toBe(next);
  });

  it('a run cancelled via complete (cancelRun) reads as stopped to a late signalFor', () => {
    const bus = new RunBus();
    bus.cancel('r4');
    bus.complete('r4');
    expect(bus.signalFor('r4').aborted).toBe(true);
    expect(bus.signalForAll(['r4']).aborted).toBe(true);
  });
});

describe('RunBus.signalForAll', () => {
  it('aborts only once every run is cancelled', () => {
    const bus = new RunBus();
    const all = bus.signalForAll(['a', 'b']);
    bus.cancel('a');
    expect(all.aborted).toBe(false);
    bus.cancel('b');
    expect(all.aborted).toBe(true);
  });

  it('is aborted at creation when all runs were already cancelled', () => {
    const bus = new RunBus();
    bus.cancel('a');
    bus.cancel('b');
    expect(bus.signalForAll(['a', 'b']).aborted).toBe(true);
  });

  it('never aborts for an empty batch', () => {
    expect(new RunBus().signalForAll([]).aborted).toBe(false);
  });
});
