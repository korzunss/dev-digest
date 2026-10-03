import { BFS_DEPTH, MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';
import { describe, it, expect, vi } from 'vitest';
import { BlastService, type BlastServiceDeps } from '../src/modules/blast/service.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';
import { HISTORY_TTL_MS } from '../src/modules/blast/constants.js';

const pull = { id: 'pr1', repoId: 'repo1', number: 42, headSha: 'sha1' };
const repo = { owner: 'acme', name: 'x', fullName: 'acme/x', provider: 'github', apiBase: null };

function setup(over: { result?: Partial<BlastResult>; lookup?: () => Promise<unknown> } = {}) {
  const getBlastRadius = vi.fn(async (): Promise<BlastResult> => ({
    changedSymbols: [{ file: 'a.ts', name: 'f', kind: 'function', rank: 1 }],
    callers: [{ file: 'b.ts', symbol: 'g', viaSymbol: 'f', line: 1, rank: 0, depth: 1, via: null }],
    impactedEndpoints: [],
    source: 'index',
    limits: { callersPerSymbol: MAX_CALLERS_PER_SYMBOL, depth: BFS_DEPTH },
    indexStatus: 'full',
    ...over.result,
  }));
  const lookup = vi.fn(
    over.lookup ??
      (async () => ({
        supported: true,
        items: [{ number: 7, title: 'Old', author: 'bob', merged_at: '2026-01-01T00:00:00Z', paths: ['a.ts'] }],
      })),
  );
  let now = 1000;
  const deps = {
    repo: {
      getPull: vi.fn(async (_w: string, id: string) =>
        id === 'pr1' ? { pull, repo } : undefined,
      ),
      getPrFilePaths: vi.fn(async () => ['b.ts', 'a.ts']),
    },
    repoIntel: { getBlastRadius },
    forge: vi.fn(async () => ({ listMergedPullsTouching: lookup })),
    now: () => now,
  } as unknown as BlastServiceDeps;
  const log = { info: vi.fn(), warn: vi.fn() };
  return { svc: new BlastService(deps), getBlastRadius, lookup, log, deps, tick: (ms: number) => (now += ms) };
}

describe('BlastService.getBlast', () => {
  it('calls the facade once and logs the persistent-index line', async () => {
    const { svc, getBlastRadius, log } = setup();
    const out = await svc.getBlast('w', 'pr1', log);
    expect(getBlastRadius).toHaveBeenCalledTimes(1);
    expect(out?.downstream).toHaveLength(1);
    expect(log.info.mock.calls[0]![1]).toContain('no AST/import-graph rebuild');
  });

  it('logs the fallback line when degraded', async () => {
    const { svc, log } = setup({ result: { source: 'fallback', degraded: true, reason: 'no_data' } });
    await svc.getBlast('w', 'pr1', log);
    expect(log.info.mock.calls[0]![1]).toContain('degraded ripgrep fallback');
    expect(log.info.mock.calls[0]![1]).not.toContain('no AST/import-graph rebuild');
  });

  it('returns undefined for an unknown PR', async () => {
    const { svc, getBlastRadius, log } = setup();
    expect(await svc.getBlast('w', 'nope', log)).toBeUndefined();
    expect(getBlastRadius).not.toHaveBeenCalled();
  });
});

describe('BlastService.getHistory', () => {
  it('maps items, excludes the current PR, and caches within the TTL', async () => {
    const { svc, lookup, log, tick } = setup();
    const first = await svc.getHistory('w', 'pr1', log);
    expect(first).toEqual({
      status: 'ok',
      history: [
        { pr_number: 7, title: 'Old', author: 'bob', merged_at: '2026-01-01T00:00:00Z', files_overlap: ['a.ts'], notes: '' },
      ],
    });
    expect(lookup.mock.calls[0]![1]).toEqual(['a.ts', 'b.ts']);
    expect(lookup.mock.calls[0]![2]).toMatchObject({ excludeNumber: 42 });
    await svc.getHistory('w', 'pr1', log);
    expect(lookup).toHaveBeenCalledTimes(1);
    tick(HISTORY_TTL_MS + 1);
    await svc.getHistory('w', 'pr1', log);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('misses the cache for a new headSha', async () => {
    const { svc, lookup, log, deps } = setup();
    await svc.getHistory('w', 'pr1', log);
    (deps.repo.getPull as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      pull: { ...pull, headSha: 'sha2' },
      repo,
    });
    await svc.getHistory('w', 'pr1', log);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('reports unsupported forges', async () => {
    const { svc, log } = setup({ lookup: async () => ({ supported: false, items: [] }) });
    expect(await svc.getHistory('w', 'pr1', log)).toEqual({ status: 'unsupported', history: [] });
  });

  it('reports unavailable on a forge failure and retries next call', async () => {
    let calls = 0;
    const { svc, log, lookup } = setup({
      lookup: async () => {
        calls++;
        if (calls === 1) throw new Error('boom');
        return { supported: true, items: [] };
      },
    });
    expect(await svc.getHistory('w', 'pr1', log)).toEqual({ status: 'unavailable', history: [] });
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect((await svc.getHistory('w', 'pr1', log))?.status).toBe('ok');
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
