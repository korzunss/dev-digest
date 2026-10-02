import type { BlastRadius } from "@devdigest/shared";

export interface BlastStats {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/** Unique counts across every downstream group (a caller reached from two
    symbols is still one caller). Derived on render — never stored. */
export function blastStats(data: BlastRadius): BlastStats {
  const callers = new Set<string>();
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  for (const d of data.downstream) {
    for (const c of d.callers) callers.add(`${c.file}:${c.line}:${c.name}`);
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const k of d.crons_affected) crons.add(k);
  }
  return {
    symbols: data.changed_symbols.length,
    callers: callers.size,
    endpoints: endpoints.size,
    crons: crons.size,
  };
}
