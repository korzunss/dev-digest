import { describe, expect, it } from "vitest";
import type { AgentStatsBreakdown, BreakdownBucket } from "@devdigest/shared/contracts/agent-performance.js";
import {
  bucketLabel,
  bucketRange,
  categoryLegend,
  crossesYear,
  findingsView,
  memoryView,
  severityLegend,
  sharePercent,
  skillsView,
  sortSkillRows,
} from "./helpers";

const FROM = "2026-10-01T00:00:00.000Z";

function data(over: Partial<AgentStatsBreakdown> = {}): AgentStatsBreakdown {
  return {
    window: { period: "30d", from: FROM, to: "2026-10-31T00:00:00.000Z", previous_from: FROM, previous_to: FROM },
    counted_runs: 4,
    local_runs: 4,
    skills: { tracked_since: "2026-09-01T00:00:00.000Z", denominator: 4, rows: [{ skill_id: "a", name: "A", runs: 2 }] },
    memory: { tracked_since: "2026-09-01T00:00:00.000Z", denominator: 4, rows: [{ text: "t", pr: null, runs: 1 }] },
    findings: { total: 3, by_category: [], bucket_kind: "7d", buckets: [] },
    ...over,
  } as AgentStatsBreakdown;
}

const bucket = (start: string, end: string, over: Partial<BreakdownBucket> = {}): BreakdownBucket => ({
  start,
  end,
  critical: 0,
  warning: 0,
  suggestion: 0,
  other: 0,
  ...over,
});

describe("sharePercent", () => {
  it("rounds to a whole percent", () => {
    expect(sharePercent(1, 3)).toBe("33%");
    expect(sharePercent(4, 4)).toBe("100%");
  });
  it('shows "<1%" when above zero but rounding to zero, and 0% for nothing', () => {
    expect(sharePercent(1, 1000)).toBe("<1%");
    expect(sharePercent(0, 10)).toBe("0%");
    expect(sharePercent(3, 0)).toBe("0%");
  });
});

describe("sortSkillRows", () => {
  it("sorts by share descending, then by name", () => {
    const rows = [
      { skill_id: "1", name: "Zed", runs: 2 },
      { skill_id: "2", name: "Alpha", runs: 2 },
      { skill_id: "3", name: "Top", runs: 5 },
    ];
    expect(sortSkillRows(rows, 10).map((r) => r.name)).toEqual(["Top", "Alpha", "Zed"]);
  });
});

describe("skillsView", () => {
  it("is ciOnly with no local runs, ahead of notRecorded", () => {
    expect(skillsView(data({ local_runs: 0, skills: { tracked_since: null, denominator: 0, rows: [] } })).kind).toBe(
      "ciOnly",
    );
  });
  it("is notRecorded when nothing was ever tracked", () => {
    expect(skillsView(data({ skills: { tracked_since: null, denominator: 0, rows: [] } })).kind).toBe("notRecorded");
  });
  it("keeps only the no-data line at denominator 0", () => {
    const v = skillsView(data({ skills: { tracked_since: "2026-10-20T00:00:00.000Z", denominator: 0, rows: [] } }));
    expect(v).toEqual({ kind: "noDenominator", noDataBefore: "2026-10-20T00:00:00.000Z" });
  });
  it("is noSkills with a denominator and no rows", () => {
    expect(skillsView(data({ skills: { tracked_since: FROM, denominator: 2, rows: [] } })).kind).toBe("noSkills");
  });
  it("lists rows, and flags no-data-before only when tracking started inside the period", () => {
    const early = skillsView(data());
    expect(early).toMatchObject({ kind: "list", noDataBefore: null });
    const late = skillsView(
      data({ skills: { tracked_since: "2026-10-11T00:00:00.000Z", denominator: 1, rows: [{ skill_id: "a", name: "A", runs: 1 }] } }),
    );
    expect(late).toMatchObject({ kind: "list", noDataBefore: "2026-10-11T00:00:00.000Z" });
  });
});

describe("memoryView", () => {
  it("is ciOnly with no local runs", () => {
    expect(memoryView(data({ local_runs: 0 })).kind).toBe("ciOnly");
  });
  it("is none without rows, even at denominator 0, still carrying the no-data line", () => {
    const v = memoryView(data({ memory: { tracked_since: "2026-10-11T00:00:00.000Z", denominator: 0, rows: [] } }));
    expect(v).toEqual({ kind: "none", noDataBefore: "2026-10-11T00:00:00.000Z" });
  });
  it("lists rows in server order", () => {
    expect(memoryView(data()).kind).toBe("list");
  });
});

describe("findingsView", () => {
  it("covers ciOnly, none and charts", () => {
    expect(findingsView(data({ local_runs: 0 }))).toBe("ciOnly");
    expect(findingsView(data({ findings: { total: 0, by_category: [], bucket_kind: "7d", buckets: [] } }))).toBe("none");
    expect(findingsView(data())).toBe("charts");
  });
});

describe("bucket labels and ranges", () => {
  const h3 = bucket("2026-10-11T08:00:00.000Z", "2026-10-11T12:00:00.000Z");
  it("labels H / W by position", () => {
    expect(bucketLabel("4h", 2, h3, "UTC")).toBe("H3");
    expect(bucketLabel("7d", 0, h3, "UTC")).toBe("W1");
  });
  it("renders a 4 h range as the AC-32 example", () => {
    expect(bucketRange("4h", h3, "UTC")).toBe("Oct 11 08:00–12:00");
  });
  it("shows a date on both ends when the days differ, and reads in the given zone", () => {
    const b = bucket("2026-10-11T22:00:00.000Z", "2026-10-12T02:00:00.000Z");
    expect(bucketRange("4h", b, "UTC")).toBe("Oct 11 22:00–Oct 12 02:00");
    expect(bucketRange("4h", b, "Asia/Kolkata")).toBe("Oct 12 03:30–07:30");
  });
  it("ends a bucket that stops at midnight on the same day", () => {
    expect(bucketRange("4h", bucket("2026-10-11T20:00:00.000Z", "2026-10-12T00:00:00.000Z"), "UTC")).toBe(
      "Oct 11 20:00–00:00",
    );
  });
  it("renders a 7 d range as dates with the last day inside", () => {
    expect(bucketRange("7d", bucket("2026-10-01T00:00:00.000Z", "2026-10-08T00:00:00.000Z"), "UTC")).toBe("Oct 1–Oct 7");
  });
  it("labels months short, with the year only when the range crosses one", () => {
    const dec = bucket("2025-12-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    const jan = bucket("2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z");
    expect(crossesYear([dec, jan], "UTC")).toBe(true);
    expect(crossesYear([jan], "UTC")).toBe(false);
    expect(bucketLabel("month", 0, dec, "UTC")).toBe("Dec");
    expect(bucketLabel("month", 0, dec, "UTC", true)).toBe("Dec 2025");
  });
});

describe("categoryLegend", () => {
  it("lists the five known categories with real zeros, then unknown values as stored", () => {
    const legend = categoryLegend(
      [
        { category: "bug", count: 2 },
        { category: "Docs", count: 1 },
        { category: "SECURITY", count: 1 },
      ],
      4,
    );
    expect(legend.map((e) => e.category)).toEqual(["security", "bug", "perf", "style", "test", "Docs", "SECURITY"]);
    expect(legend.find((e) => e.category === "perf")).toMatchObject({ count: 0, percent: "0%", known: true });
    expect(legend.find((e) => e.category === "bug")?.percent).toBe("50%");
    const unknown = legend.find((e) => e.category === "Docs");
    expect(unknown).toMatchObject({ known: false, color: "var(--text-muted)", count: 1 });
  });
});

describe("severityLegend", () => {
  const buckets = [bucket(FROM, FROM, { critical: 1, warning: 2 }), bucket(FROM, FROM, { suggestion: 3 })];
  it("lists Critical, Warning, Suggestion with period sums and hides Other at 0", () => {
    expect(severityLegend(buckets).map((e) => [e.key, e.count])).toEqual([
      ["critical", 1],
      ["warning", 2],
      ["suggestion", 3],
    ]);
  });
  it("adds Other, in the muted colour, only when it is above 0", () => {
    const legend = severityLegend([...buckets, bucket(FROM, FROM, { other: 2 })]);
    expect(legend[3]).toEqual({ key: "other", count: 2, color: "var(--text-muted)" });
  });
});
