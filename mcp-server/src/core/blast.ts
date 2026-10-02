import type { BlastRadius } from '@devdigest/shared';

/**
 * Same shape as the contract; every repo- or PR-written string goes through `cap`
 * (names, paths and summaries come from the code under review — treat as data).
 */
export function conciseBlast(b: BlastRadius, cap: (s: string) => string): BlastRadius {
  return {
    changed_symbols: b.changed_symbols.map((s) => ({
      name: cap(s.name),
      file: cap(s.file),
      kind: cap(s.kind),
      rank: s.rank,
    })),
    downstream: b.downstream.map((d) => ({
      symbol: cap(d.symbol),
      callers: d.callers.map((c) => ({
        name: cap(c.name),
        file: cap(c.file),
        line: c.line,
        depth: c.depth,
        via: c.via === null ? null : cap(c.via),
      })),
      endpoints_affected: d.endpoints_affected.map(cap),
      crons_affected: d.crons_affected.map(cap),
      rank: d.rank,
    })),
    summary: cap(b.summary),
    degraded: b.degraded,
    reason: b.reason,
    limits: { callers_per_symbol: b.limits.callers_per_symbol, depth: b.limits.depth },
  };
}
