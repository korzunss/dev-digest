import type { PerfRow } from "@devdigest/shared/contracts/agent-performance.js";
import { SMALL_SAMPLE_MAX } from "@/components/perf-kit";

export type SortKey = "runs" | "avgCost" | "avgDuration" | "accept" | "lastRun";
export type SortDir = "asc" | "desc";

/** A row with no counted run has no metric values (AC-13): it sorts last on every column. */
function valueOf(row: PerfRow, key: SortKey): number | null {
  const c = row.current;
  if (c.runs === 0) return null;
  switch (key) {
    case "runs":
      return c.runs;
    case "avgCost":
      return c.avg_cost_usd;
    case "avgDuration":
      return c.avg_duration_ms;
    case "accept":
      return c.accept_rate;
    case "lastRun": {
      const ms = c.last_run_at ? Date.parse(c.last_run_at) : NaN;
      return Number.isNaN(ms) ? null : ms;
    }
  }
}

function nameOf(row: PerfRow): string {
  return row.agent_name ?? "";
}

function byName(a: PerfRow, b: PerfRow): number {
  return nameOf(a).localeCompare(nameOf(b));
}

/** AC-11 group: 0 = 10+ decisions, 1 = small sample, 2 = no rate. */
function acceptGroup(row: PerfRow): 0 | 1 | 2 {
  const n = row.current.accepted + row.current.dismissed;
  if (row.current.accept_rate == null || n === 0) return 2;
  return n > SMALL_SAMPLE_MAX ? 0 : 1;
}

/** Accept, descending, in the three AC-11 groups; ties by name. */
function compareAcceptDesc(a: PerfRow, b: PerfRow): number {
  const ga = acceptGroup(a);
  const gb = acceptGroup(b);
  if (ga !== gb) return ga - gb;
  return (b.current.accept_rate ?? 0) - (a.current.accept_rate ?? 0) || byName(a, b);
}

/**
 * AC-10…AC-12 and AC-14: the table order. The Deleted agents row is always last.
 * Rows with no value for the column sort last in either direction. Accept descending
 * uses the AC-11 groups; ascending is its reverse, with the rate-less rows still last.
 */
export function sortRows(rows: PerfRow[], key: SortKey, dir: SortDir): PerfRow[] {
  const agents = rows.filter((r) => r.kind !== "deleted");
  const deleted = rows.filter((r) => r.kind === "deleted");

  let ordered: PerfRow[];
  if (key === "accept") {
    const rated = agents.filter((r) => acceptGroup(r) !== 2).sort(compareAcceptDesc);
    const unrated = agents.filter((r) => acceptGroup(r) === 2).sort(byName);
    ordered = [...(dir === "desc" ? rated : rated.reverse()), ...unrated];
  } else {
    const withValue = agents.filter((r) => valueOf(r, key) != null);
    const without = agents.filter((r) => valueOf(r, key) == null).sort(byName);
    withValue.sort((a, b) => {
      const diff = (valueOf(a, key) as number) - (valueOf(b, key) as number);
      return (dir === "desc" ? -diff : diff) || byName(a, b);
    });
    ordered = [...withValue, ...without];
  }
  return [...ordered, ...deleted];
}
