import { describe, it, expect } from "vitest";
import { appliesToSummary, pathsToText, textToPaths } from "./applies-to";

describe("appliesToSummary", () => {
  it("is null for an unscoped skill", () => {
    expect(appliesToSummary([])).toBeNull();
    expect(appliesToSummary(null)).toBeNull();
    expect(appliesToSummary(undefined)).toBeNull();
  });

  it("joins the globs with a comma", () => {
    expect(appliesToSummary(["**/*.ts", "**/*.tsx"])).toBe("**/*.ts, **/*.tsx");
  });
});

describe("paths <-> textarea text", () => {
  it("round-trips one glob per line and drops blank lines", () => {
    expect(textToPaths("**/*.ts\n\n  **/*.tsx  \n")).toEqual(["**/*.ts", "**/*.tsx"]);
    expect(pathsToText(["a", "b"])).toBe("a\nb");
    expect(pathsToText(null)).toBe("");
  });
});
