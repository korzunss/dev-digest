/**
 * No-model test for the workflow read filter: a guessed repo root must not count as a read.
 *   pnpm vitest run src/runtime/sandbox.test.ts
 */

import { describe, expect, test } from "vitest";
import { readHits } from "./sandbox.js";

const DIR = "/var/folders/x/devdigest-eval-abc";
const PREFIXES = ["/private/var/folders/x/devdigest-eval-abc/", `${DIR}/`];
const ROOT = "/Users/me/_projects/www/ai/dev-digest";
const present = new Set([`${DIR}/server/insights/gotchas.md`]);
const exists = (p: string) => present.has(p);
const hits = (p: string) => readHits(p, PREFIXES, ROOT, DIR, exists);

describe("readHits", () => {
  test("counts an existing file by its sandbox path, either realpath form", () => {
    expect(hits(`${DIR}/server/insights/gotchas.md`)).toBe(true);
    expect(hits("/private/var/folders/x/devdigest-eval-abc/server/insights/gotchas.md")).toBe(true);
  });

  test("counts a real-repo absolute path when the file exists in the worktree", () => {
    expect(hits(`${ROOT}/server/insights/gotchas.md`)).toBe(true);
  });

  test("rejects a guessed root that only contains the expected substring", () => {
    expect(hits("/Users/me/projects/www-ai-dev-digest/server/insights/gotchas.md")).toBe(false);
    expect(hits("/server/insights/gotchas.md")).toBe(false);
    expect(hits("/Users/me/.claude/projects/-Users-me--projects-www-ai-dev-digest/server/insights/gotchas.md")).toBe(false);
  });

  test("rejects a path under a known root whose file does not exist", () => {
    expect(hits(`${DIR}/server/INSIGHTS-typo.md`)).toBe(false);
    expect(hits(`${ROOT}/client/insights/gotchas.md`)).toBe(false);
  });
});
