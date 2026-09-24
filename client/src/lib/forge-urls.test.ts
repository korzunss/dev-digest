import { describe, it, expect } from "vitest";
import { forgePrUrl, forgeBlobUrl, FORGE_LABEL, type ForgeRepoRef } from "./forge-urls";

const gh: ForgeRepoRef = { provider: "github", api_base: null, full_name: "acme/api" };
const gl: ForgeRepoRef = { provider: "gitlab", api_base: null, full_name: "acme/api" };
const selfHosted: ForgeRepoRef = {
  provider: "gitlab",
  api_base: "https://acme.com/gitlab",
  full_name: "team/backend/api",
};

describe("forgePrUrl", () => {
  it("uses each forge's own grammar", () => {
    expect(forgePrUrl(gh, 482)).toBe("https://github.com/acme/api/pull/482");
    // GitLab needs the `/-/` infix and says merge_requests.
    expect(forgePrUrl(gl, 7)).toBe("https://gitlab.com/acme/api/-/merge_requests/7");
  });

  it("keeps a relative-URL install prefix and a nested group", () => {
    expect(forgePrUrl(selfHosted, 7)).toBe(
      "https://acme.com/gitlab/team/backend/api/-/merge_requests/7",
    );
  });
});

describe("forgeBlobUrl", () => {
  it("pins to the sha", () => {
    expect(forgeBlobUrl(gh, "abc123", "src/a.ts")).toBe(
      "https://github.com/acme/api/blob/abc123/src/a.ts",
    );
    expect(forgeBlobUrl(gl, "abc123", "src/a.ts")).toBe(
      "https://gitlab.com/acme/api/-/blob/abc123/src/a.ts",
    );
  });

  it("uses the line-range anchor each forge accepts", () => {
    // Easy to miss: GitHub repeats the L, GitLab does not.
    expect(forgeBlobUrl(gh, "s", "a.ts", 10, 20)).toMatch(/#L10-L20$/);
    expect(forgeBlobUrl(gl, "s", "a.ts", 10, 20)).toMatch(/#L10-20$/);
  });

  it("emits a single anchor when start === end", () => {
    expect(forgeBlobUrl(gh, "s", "a.ts", 10, 10)).toMatch(/#L10$/);
    expect(forgeBlobUrl(gl, "s", "a.ts", 10, 10)).toMatch(/#L10$/);
  });

  it("encodes path segments but keeps the separators", () => {
    expect(forgeBlobUrl(gh, "s", "src/a b/c#d.ts")).toContain("/src/a%20b/c%23d.ts");
  });
});

describe("FORGE_LABEL", () => {
  it("labels the external-link button", () => {
    expect(FORGE_LABEL.github).toBe("GitHub");
    expect(FORGE_LABEL.gitlab).toBe("GitLab");
  });
});
