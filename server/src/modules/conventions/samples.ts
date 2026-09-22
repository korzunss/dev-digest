/**
 * Conventions extractor — the sampling stage: WHICH files the model is shown,
 * and what text of each.
 *
 * Selection is code, never a model (spec 004). Three sources, concatenated in a
 * fixed order so two scans of an unchanged tree show the model the same thing:
 *
 *   1. config files    — an allowlist walk of the clone root;
 *   2. ranked source   — whatever the caller got from `getConventionSamples()`;
 *   3. a fallback walk — ONLY when (2) came back empty.
 *
 * Reading is separate from selecting (`readSamples`) because selection is the
 * part the service persists on the scan (`sample_paths`), and the grounding gate
 * later checks a citation against that same list.
 */
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { isInsideDir, toRepoRelative } from '../context/helpers.js';
import type { SampleFile } from './types.js';
import {
  CONFIG_ALLOWLIST,
  CONFIG_WALK_DEPTH,
  FALLBACK_EXTENSIONS,
  FALLBACK_SKIP_DIRS,
  FALLBACK_WALK_DEPTH,
  MAX_SAMPLE_BYTES,
  MAX_SAMPLE_FILES,
  MAX_SAMPLE_LINES,
} from './constants.js';

const CONFIG_NAMES: ReadonlySet<string> = new Set(CONFIG_ALLOWLIST);
const SKIP_DIRS: ReadonlySet<string> = new Set(FALLBACK_SKIP_DIRS);
const FALLBACK_EXT: ReadonlySet<string> = new Set(FALLBACK_EXTENSIONS);

/**
 * The repo-relative POSIX paths to show the model: de-duplicated, capped at
 * MAX_SAMPLE_FILES, deterministic for a given tree.
 *
 * `fromIntel` is passed in rather than fetched here so this stage stays
 * fs-only — the service owns the `repoIntel` call and its top-N.
 */
export async function collectSamplePaths(opts: {
  cloneDir: string;
  fromIntel: string[];
}): Promise<string[]> {
  const { cloneDir, fromIntel } = opts;

  // 1. Configs. These must be collected here because repo-intel's
  //    JUNK_PATH_PATTERNS drops `eslint`, `prettier` and `.config.` from every
  //    rank-driven sample (repo-intel/service.ts) — so the files that state a
  //    repo's rules out loud can only reach the model through this walk.
  //    Root-level configs first: `package.json` describes the repo, a nested
  //    `packages/api/package.json` describes one corner of it.
  const configs = (
    await walkFiles(cloneDir, CONFIG_WALK_DEPTH, (name) => CONFIG_NAMES.has(name))
  ).sort(byDepthThenPath);

  // 2. Ranked source, verbatim and in rank order — the caller already applied
  //    TOP_FILES, and re-sorting here would throw the ranking away.
  // 3. Fallback, and only now: `getConventionSamples()` returns [] whenever
  //    REPO_INTEL_ENABLED=false OR the repo has not been indexed yet, and a
  //    freshly added repo is the common case. Without this the feature would
  //    quietly extract nothing on a clean machine.
  const source =
    fromIntel.length > 0
      ? fromIntel
      : (
          await walkFiles(cloneDir, FALLBACK_WALK_DEPTH, (name) =>
            FALLBACK_EXT.has(path.extname(name).toLowerCase()),
          )
        ).sort(byDepthThenPath);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const candidate of [...configs, ...source]) {
    const rel = toPosixRelative(candidate);
    if (rel === '' || seen.has(rel)) continue;
    seen.add(rel);
    out.push(rel);
    if (out.length >= MAX_SAMPLE_FILES) break;
  }
  return out;
}

/**
 * Read each sampled path from the clone, capped and truncated on a LINE
 * boundary — a half-line in the prompt is a half-line in a citation, and the
 * grounding gate would then drop a true rule for quoting what it was shown.
 *
 * A path that cannot be read is skipped, never thrown: the paths come from a
 * walk and from repo-intel's index, both of which can name a file that a
 * concurrent resync has since removed, and losing one sample is not a reason to
 * fail a scan.
 */
export async function readSamples(cloneDir: string, paths: string[]): Promise<SampleFile[]> {
  // Resolve the ROOT as well as each target. On macOS a clone under a temp dir
  // resolves `/var/...` → `/private/var/...`, so comparing a real target
  // against a raw root rejects every honest read — the guard fails closed and
  // looks like it caught an escape (server/INSIGHTS.md).
  const realDir = await realpath(cloneDir).catch(() => null);
  if (realDir === null) return [];
  const root = path.resolve(realDir);

  const out: SampleFile[] = [];
  for (const requested of paths) {
    const target = path.resolve(cloneDir, requested);
    const realTarget = await realpath(target).catch(() => null);
    if (realTarget === null) continue;

    // Covers both spellings of an escape: a `..` that climbs out, and a symlink
    // committed inside the clone that lands outside it.
    if (!isInsideDir(root, realTarget)) continue;

    const info = await stat(realTarget).catch(() => null);
    if (!info || !info.isFile()) continue;

    const buffer = await readFile(realTarget).catch(() => null);
    if (buffer === null) continue;

    const sample = capToLines(buffer);
    if (sample === null) continue;

    out.push({
      // The path as addressed, not where a symlink landed — the model cites
      // what it was shown, and the evidence link has to resolve on GitHub.
      path: toRepoRelative(cloneDir, target),
      ...sample,
    });
  }
  return out;
}

/**
 * Apply MAX_SAMPLE_BYTES then MAX_SAMPLE_LINES, cutting only between lines.
 * `null` means "nothing complete survived" — a single line longer than the byte
 * cap, i.e. a minified bundle, which is worth no prompt budget anyway.
 */
function capToLines(buffer: Buffer): Omit<SampleFile, 'path'> | null {
  let truncated = buffer.byteLength > MAX_SAMPLE_BYTES;
  const head = truncated ? buffer.subarray(0, MAX_SAMPLE_BYTES) : buffer;
  let lines = head.toString('utf8').split('\n');

  // The byte cut lands mid-line by definition, and may have halved a multi-byte
  // character; dropping that trailing fragment fixes both at once.
  if (truncated) lines.pop();

  if (lines.length > MAX_SAMPLE_LINES) {
    lines = lines.slice(0, MAX_SAMPLE_LINES);
    truncated = true;
  }
  if (lines.length === 0) return null;

  return { text: lines.join('\n'), lines, truncated };
}

/**
 * Every file under `root` (to `maxDepth` directories deep) whose basename
 * `accept`s, as repo-relative POSIX paths, in readdir order.
 *
 * Symlinks are never followed — they loop, and a link is not a file this repo
 * wrote. Generated and vendored directories are skipped for both walks: without
 * that, `node_modules` alone supplies thousands of `package.json` files and the
 * config allowlist matches every one of them.
 */
async function walkFiles(
  root: string,
  maxDepth: number,
  accept: (basename: string) => boolean,
): Promise<string[]> {
  const out: string[] = [];

  const visit = async (dir: string, depth: number): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      // Unreadable directory (permissions, dangling link) — sample what we can.
      return;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.git')) continue;
        if (depth + 1 > maxDepth) continue;
        await visit(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!accept(entry.name)) continue;

      out.push(path.relative(root, full).split(path.sep).join('/'));
    }
  };

  await visit(root, 0);
  return out;
}

/** Shallow before deep, then alphabetical — a total order, so it is stable. */
function byDepthThenPath(a: string, b: string): number {
  const depth = a.split('/').length - b.split('/').length;
  return depth !== 0 ? depth : a.localeCompare(b);
}

/** Normalise a caller- or index-supplied path to the form used for de-duping. */
function toPosixRelative(candidate: string): string {
  return path
    .normalize(candidate)
    .split(path.sep)
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/');
}
