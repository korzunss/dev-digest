import type { BlastRadius } from '@devdigest/shared';
import type { BlastResult } from '../repo-intel/types.js';

function sortedUnion(lists: string[][]): string[] {
  return [...new Set(lists.flat())].sort();
}

/** `"<S> changed symbols · <C> callers · <E> endpoints · <K> crons"` (+ degraded reason). */
export function buildBlastSummary(
  stats: { symbols: number; callers: number; endpoints: number; crons: number },
  reason: string | null,
): string {
  const base = `${stats.symbols} changed symbols · ${stats.callers} callers · ${stats.endpoints} endpoints · ${stats.crons} crons`;
  return reason ? `${base} · degraded: ${reason}` : base;
}

/** Pure transform of the facade's flat `BlastResult` into the grouped contract. */
export function toBlastRadius(result: BlastResult): BlastRadius {
  const facts = result.factsByFile ?? {};
  const bySymbol = new Map<string, BlastResult['callers']>();
  for (const c of result.callers) {
    const list = bySymbol.get(c.viaSymbol) ?? [];
    list.push(c);
    bySymbol.set(c.viaSymbol, list);
  }

  const downstream: BlastRadius['downstream'] = [];
  for (const [symbol, rows] of bySymbol) {
    const declFiles = new Set(
      result.changedSymbols.filter((s) => s.name === symbol).map((s) => s.file),
    );
    const callers = rows.filter((c) => !declFiles.has(c.file));
    if (callers.length === 0) continue;
    const rank = Math.max(
      0,
      ...result.changedSymbols.filter((s) => s.name === symbol).map((s) => s.rank),
    );
    downstream.push({
      symbol,
      callers: callers.map((c) => ({
        name: c.symbol,
        file: c.file,
        line: c.line,
        depth: c.depth,
        via: c.via,
      })),
      endpoints_affected: sortedUnion(callers.map((c) => facts[c.file]?.endpoints ?? [])),
      crons_affected: sortedUnion(callers.map((c) => facts[c.file]?.crons ?? [])),
      rank,
    });
  }
  downstream.sort((a, b) => b.rank - a.rank || a.symbol.localeCompare(b.symbol));

  const uniq = (xs: string[]) => new Set(xs).size;
  const reason = result.reason ?? null;
  const summary = buildBlastSummary(
    {
      symbols: result.changedSymbols.length,
      callers: uniq(downstream.flatMap((d) => d.callers.map((c) => `${c.file}#${c.name}`))),
      endpoints: uniq(downstream.flatMap((d) => d.endpoints_affected)),
      crons: uniq(downstream.flatMap((d) => d.crons_affected)),
    },
    reason,
  );

  return {
    changed_symbols: result.changedSymbols.map((s) => ({
      name: s.name,
      file: s.file,
      kind: s.kind,
      rank: s.rank,
    })),
    downstream,
    summary,
    degraded: result.degraded ?? false,
    reason,
    limits: { callers_per_symbol: result.limits.callersPerSymbol, depth: result.limits.depth },
  };
}
