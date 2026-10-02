import type { BlastRadius } from "@devdigest/shared";

export interface BlastStats {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/** Unique counts across every downstream group (one call site = one caller,
    even when reached from two symbols). Derived on render — never stored. */
export function blastStats(data: BlastRadius): BlastStats {
  const callers = new Set<string>();
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  for (const d of data.downstream) {
    for (const c of d.callers) callers.add(`${c.file}:${c.line}`);
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

const CALLABLE_KINDS = new Set(["function", "method"]);

/** `name()` for callable symbols, the bare name otherwise. */
export function symbolLabel(name: string, kind: string | undefined): string {
  return kind && CALLABLE_KINDS.has(kind) ? `${name}()` : name;
}
