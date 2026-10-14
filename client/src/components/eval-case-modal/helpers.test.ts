import { describe, it, expect } from "vitest";
import {
  appendSkeleton, diffToPrFiles, existingCaseId, expectedKind, hasHunk, isStale,
  issuesFromError, lineLabel, parseExpected, sourceLinks,
} from "./helpers";

const GIT_DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 111..222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,2 +1,3 @@",
  " keep",
  "-old",
  "+new",
  "+more",
  "diff --git a/src/b.ts b/src/b.ts",
  "--- a/src/b.ts",
  "+++ b/src/b.ts",
  "@@ -5 +5 @@",
  "-x",
  "+y",
].join("\n");

describe("diffToPrFiles", () => {
  it("splits a git diff into files with counts and hunk-only patches", () => {
    const files = diffToPrFiles(GIT_DIFF);
    expect(files.map((f) => f.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(files[0]).toMatchObject({ additions: 2, deletions: 1 });
    expect(files[0]!.patch!.startsWith("@@ -1,2 +1,3 @@")).toBe(true);
    expect(files[1]).toMatchObject({ additions: 1, deletions: 1 });
    expect(hasHunk(files)).toBe(true);
  });

  it("reads a plain ---/+++ diff, and a deleted line that starts with dashes stays a deletion", () => {
    const files = diffToPrFiles(["--- a/c.ts", "+++ b/c.ts", "@@ -1,2 +1,1 @@", "--- not a header", "+ok"].join("\n"));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ path: "c.ts", additions: 1, deletions: 1 });
  });

  it("takes the old path of a deleted file and returns [] for text with no file header", () => {
    const del = diffToPrFiles(["--- a/gone.ts", "+++ /dev/null", "@@ -1 +0,0 @@", "-bye"].join("\n"));
    expect(del[0]!.path).toBe("gone.ts");
    expect(diffToPrFiles("@@ -1 +1 @@\n-a\n+b")).toEqual([]);
    expect(diffToPrFiles("")).toEqual([]);
  });
});

describe("parseExpected", () => {
  it("accepts an array, rejects syntax errors and non-arrays without throwing", () => {
    expect(parseExpected("[]")).toEqual({ ok: true, value: [] });
    expect(parseExpected("{")).toMatchObject({ ok: false });
    expect(parseExpected('{"a":1}')).toEqual({ ok: false, message: "must be a JSON array" });
  });
});

describe("appendSkeleton", () => {
  it("appends a must_find element at the given file", () => {
    const out = JSON.parse(appendSkeleton("[]", "src/a.ts"));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ expect: "must_find", file: "src/a.ts", start_line: 1 });
  });

  it("keeps existing elements and leaves invalid JSON untouched", () => {
    const two = JSON.parse(appendSkeleton('[{"expect":"must_not_flag","file":"x","start_line":2}]', "y"));
    expect(two.map((e: { expect: string }) => e.expect)).toEqual(["must_not_flag", "must_find"]);
    expect(appendSkeleton("[oops", "y")).toBe("[oops");
  });
});

describe("expectedKind and lineLabel", () => {
  it("names the expectation type of a saved case", () => {
    expect(expectedKind([])).toBe("empty");
    expect(expectedKind([{ expect: "must_find" }])).toBe("mustFind");
    expect(expectedKind([{ expect: "must_not_flag" }, { expect: "must_not_flag" }])).toBe("mustNotFlag");
    expect(expectedKind([{ expect: "must_find" }, { expect: "must_not_flag" }])).toBe("mixed");
  });

  it("prints a single line or a range", () => {
    expect(lineLabel(12)).toBe("12");
    expect(lineLabel(12, 12)).toBe("12");
    expect(lineLabel(12, 18)).toBe("12-18");
  });
});

describe("isStale", () => {
  it("is false with no run, false when unchanged, true once either field differs", () => {
    const now = { diff: "d", expected: "e" };
    expect(isStale(null, now)).toBe(false);
    expect(isStale({ ...now }, now)).toBe(false);
    expect(isStale({ diff: "d2", expected: "e" }, now)).toBe(true);
    expect(isStale({ diff: "d", expected: "e2" }, now)).toBe(true);
  });
});

describe("server refusals and source links", () => {
  it("lists the server's detail messages, falling back to the error message", () => {
    expect(issuesFromError({ message: "m", details: [{ index: 1, field: "expected_output", message: "element 1: bad" }] })).toEqual([
      { message: "element 1: bad" },
    ]);
    expect(issuesFromError({ message: "no API key for openai", details: null })).toEqual([{ message: "no API key for openai" }]);
    expect(existingCaseId({ case_id: "c1" })).toBe("c1");
    expect(existingCaseId(null)).toBeNull();
  });

  it("builds PR and finding links, and null when the source is gone", () => {
    expect(sourceLinks({ finding_id: "f1", pr_id: "p", repo_id: "r1", pr_number: 7 })).toEqual({
      pr: "/repos/r1/pulls/7",
      finding: "/repos/r1/pulls/7#finding-f1",
    });
    expect(sourceLinks({ finding_id: null, pr_id: null, repo_id: null, pr_number: null })).toBeNull();
    expect(sourceLinks(null)).toBeNull();
  });
});
