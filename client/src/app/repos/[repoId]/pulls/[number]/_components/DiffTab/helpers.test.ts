import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffGroup } from "@devdigest/shared";
import { diffTotals, joinGroups, latestReviewFindings, markedPaths, reviewNotRun, toAnnotations } from "./helpers";
import { severityColor } from "@/lib/severity";

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "security",
    title: "Missing rate limit",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "…",
    suggestion: "…",
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function prFile(path: string, additions = 1, deletions = 0): PrFile {
  return { path, additions, deletions, patch: null };
}

function group(role: SmartDiffGroup["role"], files: { path: string; findingLines?: number[] }[]): SmartDiffGroup {
  return {
    role,
    files: files.map((f) => ({
      path: f.path,
      pseudocode_summary: null,
      additions: 1,
      deletions: 0,
      finding_lines: f.findingLines ?? [],
    })),
  };
}

describe("joinGroups", () => {
  it("joins route groups onto PR files, keeping route order, and counts FILES with findings (not findings)", () => {
    const groups: SmartDiffGroup[] = [
      group("core", [{ path: "src/a.ts", findingLines: [1, 2, 3] }, { path: "src/b.ts", findingLines: [4, 5] }]),
      group("tests", [{ path: "src/a.test.ts" }]),
    ];
    const files = [prFile("src/a.ts"), prFile("src/b.ts"), prFile("src/a.test.ts")];

    const joined = joinGroups(groups, files);

    expect(joined).toHaveLength(2);
    expect(joined[0]!.role).toBe("core");
    expect(joined[0]!.files.map((f) => f.path)).toEqual(["src/a.ts", "src/b.ts"]);
    // 2 files with findings (5 findings total across them) → count is 2, not 5.
    expect(joined[0]!.findingFileCount).toBe(2);
    expect(joined[1]!.role).toBe("tests");
    expect(joined[1]!.findingFileCount).toBe(0);
  });

  it("appends a PR file missing from the route to the existing core group", () => {
    const groups: SmartDiffGroup[] = [group("core", [{ path: "src/a.ts" }])];
    const files = [prFile("src/a.ts"), prFile("src/orphan.ts")];

    const joined = joinGroups(groups, files);

    expect(joined).toHaveLength(1);
    expect(joined[0]!.files.map((f) => f.path)).toEqual(["src/a.ts", "src/orphan.ts"]);
  });

  it("creates a core group, placed first, when the route returned none and a file is missing", () => {
    const groups: SmartDiffGroup[] = [group("docs", [{ path: "README.md" }])];
    const files = [prFile("README.md"), prFile("src/orphan.ts")];

    const joined = joinGroups(groups, files);

    expect(joined.map((g) => g.role)).toEqual(["core", "docs"]);
    expect(joined[0]!.files.map((f) => f.path)).toEqual(["src/orphan.ts"]);
  });

  it("drops nothing and adds nothing when every file is classified", () => {
    const groups: SmartDiffGroup[] = [group("core", [{ path: "src/a.ts" }])];
    const joined = joinGroups(groups, [prFile("src/a.ts")]);
    expect(joined[0]!.files).toHaveLength(1);
  });
});

describe("markedPaths", () => {
  it("collects every path with at least one finding line, across groups", () => {
    const groups: SmartDiffGroup[] = [
      group("core", [{ path: "src/a.ts", findingLines: [1] }, { path: "src/b.ts" }]),
      group("tests", [{ path: "src/a.test.ts", findingLines: [3] }]),
    ];
    expect(markedPaths(groups)).toEqual(new Set(["src/a.ts", "src/a.test.ts"]));
  });

  it("returns an empty set when no group has findings", () => {
    const groups: SmartDiffGroup[] = [group("core", [{ path: "src/a.ts" }])];
    expect(markedPaths(groups).size).toBe(0);
  });
});

describe("latestReviewFindings", () => {
  const findings = [{ id: "f1" }] as unknown as FindingRecord[];

  it("returns the findings of the latest kind='review' review", () => {
    const reviews = [
      { kind: "summary", findings: [{ id: "summary-finding" }] },
      { kind: "review", findings },
      { kind: "review", findings: [{ id: "older" }] },
    ] as unknown as ReviewRecord[];
    expect(latestReviewFindings(reviews)).toBe(findings);
  });

  it("returns [] when there is no review-kind entry, or reviews is undefined", () => {
    const reviews = [{ kind: "summary", findings }] as unknown as ReviewRecord[];
    expect(latestReviewFindings(reviews)).toEqual([]);
    expect(latestReviewFindings(undefined)).toEqual([]);
  });
});

describe("toAnnotations", () => {
  const t = (key: string) => key;
  const render = (f: FindingRecord) => f.id;
  const icon = (f: FindingRecord) => f.severity;

  it("sorts undismissed findings on the same line worst-severity-first", () => {
    const warning = finding({ id: "w1", severity: "WARNING" });
    const critical = finding({ id: "c1", severity: "CRITICAL" });
    const items = toAnnotations([warning, critical], t, render, icon);
    expect(items.map((a) => a.id)).toEqual(["c1", "w1"]);
  });

  it("gives a dismissed finding content but no color/label/icon (D4)", () => {
    const dismissed = finding({ id: "d1", dismissed_at: "2026-01-01T00:00:00Z" });
    const [item] = toAnnotations([dismissed], t, render, icon);
    expect(item!.content).toBe("d1");
    expect(item!.color).toBeUndefined();
    expect(item!.label).toBeUndefined();
    expect(item!.icon).toBeUndefined();
  });

  it("labels an undismissed finding from smartDiff.lineLabel.<severity> and colours it by severity", () => {
    const critical = finding({ id: "c1", severity: "CRITICAL" });
    const [item] = toAnnotations([critical], t, render, icon);
    expect(item!.label).toBe("smartDiff.lineLabel.CRITICAL");
    expect(item!.color).toBe(severityColor("CRITICAL"));
  });

  it("carries end_line as endLine for both undismissed and dismissed findings (D18-A)", () => {
    const undismissed = finding({ id: "u1", start_line: 61, end_line: 74 });
    const dismissed = finding({ id: "d1", start_line: 5, end_line: 9, dismissed_at: "2026-01-01T00:00:00Z" });
    const items = toAnnotations([undismissed, dismissed], t, render, icon);
    expect(items.find((a) => a.id === "u1")!.endLine).toBe(74);
    expect(items.find((a) => a.id === "d1")!.endLine).toBe(9);
  });
});

describe("reviewNotRun", () => {
  it("is false while reviews are still loading (undefined)", () => {
    expect(reviewNotRun(undefined)).toBe(false);
  });

  it("is true once loaded with no reviews at all", () => {
    expect(reviewNotRun([])).toBe(true);
  });

  it("is true when only a kind='summary' review has run", () => {
    const reviews = [{ kind: "summary" }] as unknown as ReviewRecord[];
    expect(reviewNotRun(reviews)).toBe(true);
  });

  it("is false once a kind='review' review exists", () => {
    const reviews = [{ kind: "summary" }, { kind: "review" }] as unknown as ReviewRecord[];
    expect(reviewNotRun(reviews)).toBe(false);
  });
});

describe("diffTotals", () => {
  it("sums additions and deletions across files", () => {
    const files = [prFile("a", 3, 1), prFile("b", 2, 5)];
    expect(diffTotals(files)).toEqual({ additions: 5, deletions: 6 });
  });

  it("returns zeros for an empty file list", () => {
    expect(diffTotals([])).toEqual({ additions: 0, deletions: 0 });
  });
});
