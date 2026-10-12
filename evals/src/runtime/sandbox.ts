/**
 * Throwaway git worktree for one workflow session, so nothing the session writes can reach the
 * real repo. The PreToolUse deny hook is not enough on its own: in one eval run it was never
 * called and a Write/Edit pair landed in docs/ideas/ (not reproducible in 8 targeted probes).
 *
 *   snapshot  `git stash create` (tracked edits, staged or not) or HEAD when the tree is clean —
 *             so an uncommitted CLAUDE.md / AGENTS.md / skill edit is what the session sees.
 *             Untracked files are NOT in the snapshot.
 *   detect    `git status` inside the worktree after the session = everything it changed.
 *   guard     the real repo's `git status` before vs after; anything new fails loudly.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { REPO_ROOT } from "../artifacts/paths.js";

const PREFIX = "devdigest-eval-";
// Only sandboxes older than this are treated as leftovers (Ctrl+C): a second eval run in another
// window must not delete the first one's live sandbox.
const STALE_MS = 2 * 60 * 60 * 1000;

const run = (args: string[], cwd: string): string =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const git = (args: string[], cwd = REPO_ROOT): string => run(args, cwd).trim();

/** Porcelain status lines (`XY path`), untracked files listed individually. Not trimmed: the
 * first line's leading space is part of the `XY` column (" M path"). */
const status = (cwd: string): string[] =>
  run(["status", "--porcelain", "--untracked-files=all"], cwd).split("\n").filter(Boolean);

let pruned = false;
function pruneStale(): void {
  if (pruned) return;
  pruned = true;
  const paths = git(["worktree", "list", "--porcelain"])
    .split("\n")
    .filter((l) => l.startsWith("worktree "))
    .map((l) => l.slice("worktree ".length))
    .filter((p) => basename(p).startsWith(PREFIX));
  for (const p of paths) {
    let age = Infinity;
    try {
      age = Date.now() - statSync(p).mtimeMs;
    } catch {
      // directory already gone — `worktree prune` below drops its metadata
    }
    if (age > STALE_MS) {
      try {
        git(["worktree", "remove", "--force", p]);
      } catch {
        rmSync(p, { recursive: true, force: true });
      }
    }
  }
  git(["worktree", "prune"]);
}

export interface Sandbox {
  /** Worktree root — the session's cwd. */
  dir: string;
  /** Repo-relative paths the session created, modified or deleted inside the worktree. */
  changedFiles(): string[];
  /** Rewrite sandbox paths in a string back to REPO_ROOT, so traces read like a normal run. */
  relocate(path: string): string;
  /** Remove the worktree; also throws if the REAL repo gained a change during the session. */
  dispose(): void;
}

export function createSandbox(): Sandbox {
  pruneStale();
  const realBefore = new Set(status(REPO_ROOT));
  const snapshot = git(["stash", "create"]) || git(["rev-parse", "HEAD"]);
  const dir = mkdtempSync(join(tmpdir(), PREFIX));
  git(["worktree", "add", "--detach", "--quiet", dir, snapshot]);
  // macOS: tmpdir() is /var/folders/…, its realpath /private/var/folders/…; the session may use either.
  const prefixes = [...new Set([realpathSync(dir), dir])].map((p) => `${p}/`);

  return {
    dir,
    changedFiles: () => status(dir).map((l) => l.slice(3)),
    relocate: (path) => prefixes.reduce((s, p) => s.split(p).join(`${REPO_ROOT}/`), path),
    dispose: () => {
      try {
        git(["worktree", "remove", "--force", dir]);
      } catch {
        rmSync(dir, { recursive: true, force: true });
        git(["worktree", "prune"]);
      }
      const leaked = status(REPO_ROOT).filter((l) => !realBefore.has(l));
      if (leaked.length) {
        throw new Error(
          `workflow session changed the REAL repo despite the sandbox — inspect and revert:\n  ${leaked.join("\n  ")}`,
        );
      }
    },
  };
}
