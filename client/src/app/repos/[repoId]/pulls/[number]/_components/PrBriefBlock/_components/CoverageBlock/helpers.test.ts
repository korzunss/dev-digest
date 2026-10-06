import { describe, it, expect } from "vitest";
import type { BriefMissingInput } from "@devdigest/shared";
import { groupCoverage } from "./helpers";

const m = (over: Partial<BriefMissingInput>): BriefMissingInput => ({
  input: "attached_specs",
  status: "missing",
  ref: null,
  reason: null,
  ...over,
});

describe("groupCoverage", () => {
  it("groups entries of one input and status, counting refs and keeping a shared known reason", () => {
    const rows = groupCoverage([
      m({ ref: "a.md", reason: "missing" }),
      m({ ref: "b.md", reason: "missing" }),
      m({ ref: "c.md", reason: "missing" }),
    ]);
    expect(rows).toEqual([
      { input: "attached_specs", status: "missing", refs: ["a.md", "b.md", "c.md"], reason: "missing", count: 3 },
    ]);
  });

  it("drops the reason for a mixed group or an unknown code", () => {
    expect(groupCoverage([m({ reason: "missing" }), m({ reason: "too_large" })])[0]?.reason).toBeNull();
    expect(groupCoverage([m({ reason: "weird_code" })])[0]?.reason).toBeNull();
  });

  it("counts a ref-less entry as 1, keeps first-seen order, and maps an empty list to []", () => {
    const rows = groupCoverage([m({ input: "pr_description", status: "truncated" }), m({ ref: "x" })]);
    expect(rows.map((r) => r.input)).toEqual(["pr_description", "attached_specs"]);
    expect(rows[0]?.count).toBe(1);
    expect(groupCoverage([])).toEqual([]);
  });
});
