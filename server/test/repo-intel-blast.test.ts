import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { ResolvedCallerRow } from '../src/modules/repo-intel/repository.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';
import { BFS_DEPTH, MAX_CALLERS_PER_SYMBOL, isBlastTestPath } from '../src/modules/repo-intel/constants.js';

/**
 * Blast facade over the persistent index: per-symbol cap, depth 2, declaring
 * file exclusion, real degraded reasons, rank. The repository is patched; the
 * codeIndex stubs throw so any ripgrep/AST touch on the index path fails.
 */

const sym = (path: string, name: string, line = 1) => ({
  path,
  name,
  kind: 'function',
  line,
  endLine: line + 5,
  exported: true,
  signature: null,
});

function build(opts: {
  flag?: boolean;
  state?: Partial<IndexState> | null;
  symbols?: ReturnType<typeof sym>[];
  callers: (files: string[], names: string[]) => Partial<ResolvedCallerRow>[];
  ranks?: Array<{ path: string; rank: number }>;
}) {
  const touched: string[] = [];
  const boom = (n: string) => async () => {
    touched.push(n);
    throw new Error('codeIndex touched');
  };
  const container = {
    config: { repoIntelEnabled: opts.flag ?? true },
    db: {} as never,
    codeIndex: { symbols: boom('symbols'), references: boom('references') } as never,
  } as never;
  const svc = new RepoIntelService(container);
  const symbols = opts.symbols ?? [];
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getRepoBasics: async () => null,
    tryGetIndexState: async () =>
      opts.state === null ? null : ({ status: 'full', ...opts.state } as IndexState),
    getSymbolRows: async (_r: string, paths: string[]) =>
      symbols.filter((s) => paths.includes(s.path)),
    getFileRanks: async (_r: string, paths: string[]) =>
      (opts.ranks ?? []).filter((r) => paths.includes(r.path)),
    getResolvedCallers: async (_r: string, files: string[], names: string[]) =>
      opts.callers(files, names).map((c) => ({ line: 2, rank: 1, ...c })),
    getFileFacts: async () => [],
  };
  return { svc, touched };
}

describe('RepoIntel.getBlastRadius — persistent index', () => {
  it('caps callers per changed symbol, not globally (25 + 3 → 20 + 3)', async () => {
    const symbols = [sym('src/a.ts', 'A'), sym('src/b.ts', 'B')];
    const rows: Partial<ResolvedCallerRow>[] = [];
    for (let i = 0; i < 25; i++) {
      rows.push({ fromPath: `src/ca${i}.ts`, declFile: 'src/a.ts', toSymbol: 'A', rank: i });
      symbols.push(sym(`src/ca${i}.ts`, `fa${i}`));
    }
    for (let i = 0; i < 3; i++) {
      rows.push({ fromPath: `src/cb${i}.ts`, declFile: 'src/b.ts', toSymbol: 'B' });
      symbols.push(sym(`src/cb${i}.ts`, `fb${i}`));
    }
    const { svc } = build({ symbols, callers: (_f, names) => (names.includes('A') ? rows : []) });
    const r = await svc.getBlastRadius('r', ['src/a.ts', 'src/b.ts']);
    expect(r.callers.filter((c) => c.viaSymbol === 'A')).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(r.callers.filter((c) => c.viaSymbol === 'B')).toHaveLength(3);
    expect(r.source).toBe('index');
    expect(r.degraded).toBe(false);
  });

  it('a root full at depth 1 is not traversed to depth 2; a root with room is', async () => {
    const symbols = [sym('src/a.ts', 'A'), sym('src/b.ts', 'B'), sym('src/cb.ts', 'fb')];
    const depth1: Partial<ResolvedCallerRow>[] = [
      { fromPath: 'src/cb.ts', declFile: 'src/b.ts', toSymbol: 'B' },
    ];
    for (let i = 0; i < MAX_CALLERS_PER_SYMBOL; i++) {
      depth1.push({ fromPath: `src/ca${i}.ts`, declFile: 'src/a.ts', toSymbol: 'A' });
      symbols.push(sym(`src/ca${i}.ts`, `fa${i}`));
    }
    const queried: string[][] = [];
    const { svc } = build({
      symbols,
      callers: (files, names) => {
        if (names.includes('A')) return depth1;
        queried.push([...names].sort());
        return names.includes('fb')
          ? [{ fromPath: 'src/d.ts', declFile: 'src/cb.ts', toSymbol: 'fb' }]
          : [];
      },
    });
    const r = await svc.getBlastRadius('r', ['src/a.ts', 'src/b.ts']);
    expect(queried).toEqual([['fb']]); // A's 20 callers never reach the depth-2 query
    expect(r.callers.filter((c) => c.viaSymbol === 'A')).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(r.callers.filter((c) => c.viaSymbol === 'B').map((c) => [c.file, c.depth])).toEqual([
      ['src/cb.ts', 1],
      ['src/d.ts', 2],
    ]);
  });

  it('traverses to depth 2 with `via`, excludes the declaring file, never touches codeIndex', async () => {
    const symbols = [sym('src/a.ts', 'A'), sym('src/c1.ts', 'c1'), sym('src/c2.ts', 'c2')];
    const { svc, touched } = build({
      symbols,
      ranks: [{ path: 'src/a.ts', rank: 0.7 }],
      callers: (files, names) => {
        if (files.includes('src/a.ts') && names.includes('A')) {
          return [
            { fromPath: 'src/c1.ts', declFile: 'src/a.ts', toSymbol: 'A' },
            { fromPath: 'src/a.ts', declFile: 'src/a.ts', toSymbol: 'A' }, // self
          ];
        }
        if (files.includes('src/c1.ts') && names.includes('c1')) {
          return [
            { fromPath: 'src/c2.ts', declFile: 'src/c1.ts', toSymbol: 'c1' },
            { fromPath: 'src/a.ts', declFile: 'src/c1.ts', toSymbol: 'c1' }, // root's own file
          ];
        }
        return [];
      },
    });
    const r = await svc.getBlastRadius('r', ['src/a.ts']);
    expect(BFS_DEPTH).toBe(2);
    expect(r.callers.map((c) => [c.file, c.depth, c.via])).toEqual([
      ['src/c1.ts', 1, null],
      ['src/c2.ts', 2, 'c1'],
    ]);
    expect(r.callers.every((c) => c.file !== 'src/a.ts')).toBe(true);
    expect(r.changedSymbols[0]?.rank).toBe(0.7);
    expect(r.source).toBe('index');
    expect(r.indexStatus).toBe('full');
    expect(touched).toEqual([]);
  });

  // traversal stops at BFS_DEPTH: a depth-3 caller is never reported
  it('does not report callers beyond depth 2', async () => {
    const symbols = [sym('src/a.ts', 'A'), sym('src/c1.ts', 'c1'), sym('src/c2.ts', 'c2'), sym('src/c3.ts', 'c3')];
    const { svc } = build({
      symbols,
      callers: (files, names) => {
        if (files.includes('src/a.ts') && names.includes('A')) {
          return [{ fromPath: 'src/c1.ts', declFile: 'src/a.ts', toSymbol: 'A' }];
        }
        if (files.includes('src/c1.ts') && names.includes('c1')) {
          return [{ fromPath: 'src/c2.ts', declFile: 'src/c1.ts', toSymbol: 'c1' }];
        }
        if (files.includes('src/c2.ts') && names.includes('c2')) {
          return [{ fromPath: 'src/c3.ts', declFile: 'src/c2.ts', toSymbol: 'c2' }];
        }
        return [];
      },
    });
    const r = await svc.getBlastRadius('r', ['src/a.ts']);
    expect(r.callers.map((c) => c.file)).toEqual(['src/c1.ts', 'src/c2.ts']);
    expect(Math.max(...r.callers.map((c) => c.depth))).toBe(BFS_DEPTH);
  });
});

describe('RepoIntel.getBlastRadius — degraded reasons', () => {
  const none = () => [];
  it.each([
    ['flag off', { flag: false }, 'flag_off'],
    ['no state', { state: null }, 'no_data'],
    ['failed', { state: { status: 'failed' as const } }, 'index_failed'],
    ['degraded w/ reason', { state: { status: 'degraded' as const, degradedReason: 'repo_too_large' as const } }, 'repo_too_large'],
    ['degraded w/o reason', { state: { status: 'degraded' as const } }, 'no_data'],
  ])('%s → %s', async (_n, o, reason) => {
    const { svc } = build({ ...o, callers: none });
    const r = await svc.getBlastRadius('r', ['src/a.ts']);
    expect(r.degraded).toBe(true);
    expect(r.reason).toBe(reason);
    expect(r.source).toBe('fallback');
  });
});

describe('RepoIntel.getBlastRadius — test files and call sites (D11/D12)', () => {
  const TESTS = ['src/a.test.ts', 'src/a.it.test.ts', 'test/x.ts', 'server/test/x.ts', 'src/__tests__/x.ts'];

  it('isBlastTestPath matches the D11 patterns only', () => {
    for (const p of TESTS) expect(isBlastTestPath(p)).toBe(true);
    for (const p of ['src/a.ts', 'src/latest/x.ts', 'src/contest.ts']) expect(isBlastTestPath(p)).toBe(false);
  });

  it('drops test callers at depth 1 and 2 and never uses one as `via`', async () => {
    const symbols = [sym('src/a.ts', 'A'), sym('src/c1.ts', 'c1'), ...TESTS.map((t, i) => sym(t, `t${i}`))];
    const { svc } = build({
      symbols,
      callers: (files, names) => {
        if (files.includes('src/a.ts') && names.includes('A')) {
          return [
            { fromPath: 'src/c1.ts', declFile: 'src/a.ts', toSymbol: 'A' },
            ...TESTS.map((t) => ({ fromPath: t, declFile: 'src/a.ts', toSymbol: 'A' })),
          ];
        }
        if (names.includes('c1')) {
          return TESTS.map((t) => ({ fromPath: t, declFile: 'src/c1.ts', toSymbol: 'c1' }));
        }
        return [];
      },
    });
    const r = await svc.getBlastRadius('r', ['src/a.ts']);
    expect(r.callers.map((c) => c.file)).toEqual(['src/c1.ts']);
    expect(r.callers.some((c) => c.via !== null)).toBe(false);
  });

  it('25 non-test + 5 test callers → 20', async () => {
    const symbols = [sym('src/a.ts', 'A')];
    const rows: Partial<ResolvedCallerRow>[] = [];
    for (let i = 0; i < 5; i++) rows.push({ fromPath: `src/t${i}.test.ts`, declFile: 'src/a.ts', toSymbol: 'A', rank: 99 });
    for (let i = 0; i < 25; i++) {
      rows.push({ fromPath: `src/c${i}.ts`, declFile: 'src/a.ts', toSymbol: 'A' });
      symbols.push(sym(`src/c${i}.ts`, `f${i}`));
    }
    const { svc } = build({ symbols, callers: (_f, n) => (n.includes('A') ? rows : []) });
    const r = await svc.getBlastRadius('r', ['src/a.ts']);
    expect(r.callers).toHaveLength(20);
    expect(r.callers.some((c) => isBlastTestPath(c.file))).toBe(false);
  });

  it('keeps one row per call site and dedupes the same (file, line)', async () => {
    const { svc } = build({
      symbols: [sym('src/a.ts', 'A'), sym('src/c.ts', 'c', 1)],
      callers: (_f, n) =>
        n.includes('A')
          ? [
              { fromPath: 'src/c.ts', declFile: 'src/a.ts', toSymbol: 'A', line: 10 },
              { fromPath: 'src/c.ts', declFile: 'src/a.ts', toSymbol: 'A', line: 30 },
              { fromPath: 'src/c.ts', declFile: 'src/a.ts', toSymbol: 'A', line: 30 },
            ]
          : [],
    });
    const r = await svc.getBlastRadius('r', ['src/a.ts']);
    expect(r.callers.map((c) => c.line)).toEqual([10, 30]);
  });

  it('fallback path drops test paths and keeps one row per call site', async () => {
    const container = {
      config: { repoIntelEnabled: false },
      db: {} as never,
      codeIndex: {
        symbols: async () => [sym('src/a.ts', 'A')],
        references: async () => [
          { fromPath: 'src/a.test.ts', line: 2 },
          { fromPath: 'test/x.ts', line: 2 },
          { fromPath: 'src/c.ts', line: 10 },
          { fromPath: 'src/c.ts', line: 30 },
        ],
      },
    } as never;
    const svc = new RepoIntelService(container);
    (svc as unknown as { repo: Record<string, unknown> }).repo = {
      getRepoBasics: async () => ({ owner: 'o', name: 'n', clonePath: '/tmp/x' }),
      getFileFacts: async () => [],
    };
    const r = await svc.getBlastRadius('r', ['src/a.ts']);
    expect(r.source).toBe('fallback');
    expect(r.callers.map((c) => [c.file, c.line])).toEqual([
      ['src/c.ts', 10],
      ['src/c.ts', 30],
    ]);
  });
});
