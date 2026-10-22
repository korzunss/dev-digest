import { describe, it, expect } from "vitest";
import { sortRows } from "./helpers";
import { row, zeroRow } from "./fixtures";

/** AC-10…AC-12, AC-14: default order, groups, reversal, empties last, Deleted last. */
const names = (rows: ReturnType<typeof sortRows>) => rows.map((r) => r.agent_name ?? "Deleted");

describe("sortRows", () => {
  const big = row("Big", { accepted: 12, dismissed: 8, accept_rate: 0.6 });
  const bigHigh = row("BigHigh", { accepted: 18, dismissed: 2, accept_rate: 0.9 });
  const small = row("Small", { accepted: 3, dismissed: 0, accept_rate: 1 });
  const none = row("None", { accepted: 0, dismissed: 0, accept_rate: null });
  const idle = zeroRow("Idle");
  const deleted = row(null, { accepted: 9, dismissed: 0, accept_rate: 1 });

  it("sorts Accept descending in groups: 10+ decisions, small samples, no rate, then Deleted", () => {
    const out = sortRows([deleted, none, small, big, idle, bigHigh], "accept", "desc");
    expect(names(out)).toEqual(["BigHigh", "Big", "Small", "Idle", "None", "Deleted"]);
  });

  it("reverses the rated rows on a second activation but keeps empty values and Deleted last", () => {
    const out = sortRows([deleted, none, small, big, bigHigh, idle], "accept", "asc");
    expect(names(out)).toEqual(["Small", "Big", "BigHigh", "Idle", "None", "Deleted"]);
  });

  it("sorts a numeric column in both directions; a zero-run row has no value and sorts last either way", () => {
    const a = row("A", { runs: 5 });
    const b = row("B", { runs: 50 });
    expect(names(sortRows([idle, a, b], "runs", "desc"))).toEqual(["B", "A", "Idle"]);
    expect(names(sortRows([idle, a, b], "runs", "asc"))).toEqual(["A", "B", "Idle"]);
  });

  it("puts rows with a null Avg cost last", () => {
    const a = row("A", { avg_cost_usd: null });
    const b = row("B", { avg_cost_usd: 0.1 });
    expect(names(sortRows([a, b], "avgCost", "asc"))).toEqual(["B", "A"]);
  });
});
