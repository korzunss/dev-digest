import { describe, it, expect } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import type { ResolvedCallerRow } from '../src/modules/repo-intel/repository.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';
import { BFS_DEPTH, MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';

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
