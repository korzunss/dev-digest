/**
 * Onboarding — deterministic clone facts.
 *
 * Reads a handful of well-known manifests from the clone and returns NAMES only:
 * script names + commands, dependency-derived stack labels, the root listing.
 * No file contents leave this function (spec 009 AC-10).
 *
 * The clone is untrusted: a committed symlink can point at `.git/config`, which
 * carries the forge token. So every read is (1) a regular file, never a symlink,
 * (2) `realpath`-contained in the realpath of the clone (both sides resolved),
 * (3) never under `.git/`, and (4) size-capped. Any failure yields empty facts
 * for that source, never a throw.
 */
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  COMPOSE_FILE_NAMES,
  ENV_EXAMPLE_NAMES,
  LOCKFILES,
  MANIFEST_MAX_BYTES,
  PACKAGE_DIRS_MAX,
  PACKAGE_MANAGERS,
  SCRIPTS_MAX,
  SCRIPT_COMMAND_MAX,
  STACK_DEPENDENCIES,
  STACK_FILES,
  STRUCTURE_MAX,
  type PackageManager,
} from './constants.js';
import type { CloneFacts, ScriptFact } from './types.js';

/** Only the fields we use; everything else in a package.json is ignored. */
const PackageJson = z.object({
  scripts: z.record(z.string(), z.string()).optional(),
  dependencies: z.record(z.string(), z.unknown()).optional(),
  devDependencies: z.record(z.string(), z.unknown()).optional(),
  packageManager: z.string().optional(),
});
type PackageJson = z.infer<typeof PackageJson>;

const SKIP_DIRS = new Set(['node_modules']);

export function emptyFacts(): CloneFacts {
  return {
    structure: [],
    stack: [],
    packageManager: 'npm',
    hasRootManifest: false,
    packageDirs: [],
    scripts: [],
    envExample: null,
    composeFile: null,
  };
}

function isInside(root: string, target: string): boolean {
  return target === root || target.startsWith(root + path.sep);
}

/**
 * Real, contained, non-symlink regular file at `rel` under `root` (both already
 * the realpath of the clone), or null. `rel` is a repo-relative POSIX path.
 */
async function safeFile(root: string, rel: string): Promise<{ abs: string; size: number } | null> {
  if (rel === '' || rel.split('/').some((s) => s === '..' || s === '.git')) return null;
  const abs = path.join(root, rel);
  try {
    const st = await lstat(abs);
    if (st.isSymbolicLink() || !st.isFile()) return null;
    const real = await realpath(abs);
    if (!isInside(root, real)) return null;
    // Re-apply the .git rule to the repo-relative form of the REAL target.
    const realRel = path.relative(root, real).split(path.sep);
    if (realRel.includes('.git')) return null;
    return { abs: real, size: st.size };
  } catch {
    return null;
  }
}

async function readManifest(root: string, rel: string): Promise<PackageJson | null> {
  const file = await safeFile(root, rel);
  if (!file || file.size > MANIFEST_MAX_BYTES) return null;
  try {
    const parsed = PackageJson.safeParse(JSON.parse(await readFile(file.abs, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function exists(root: string, rel: string): Promise<boolean> {
  return (await safeFile(root, rel)) !== null;
}

async function firstExisting(root: string, names: readonly string[]): Promise<string | null> {
  for (const n of names) if (await exists(root, n)) return n;
  return null;
}

function packageManagerFrom(field: string | undefined): PackageManager | null {
  const name = field?.split('@')[0];
  return (PACKAGE_MANAGERS as readonly string[]).includes(name ?? '')
    ? (name as PackageManager)
    : null;
}

function pushUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
}

export async function collectCloneFacts(cloneDir: string): Promise<CloneFacts> {
  const facts = emptyFacts();
  let root: string;
  try {
    root = await realpath(cloneDir);
  } catch {
    return facts; // ENOENT / EACCES: no clone to read
  }

  // Root listing — real entries only; a symlink (file or dir) is not followed or shown.
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return facts;
  }
  const visible = entries
    .filter((e) => !e.name.startsWith('.') && !SKIP_DIRS.has(e.name) && !e.isSymbolicLink())
    .sort((a, b) => a.name.localeCompare(b.name));
  facts.structure = visible
    .slice(0, STRUCTURE_MAX)
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name));

  // Manifests: the root one, then up to PACKAGE_DIRS_MAX first-level real dirs.
  const manifests: Array<{ dir: string; pkg: PackageJson }> = [];
  const rootPkg = await readManifest(root, 'package.json');
  if (rootPkg) {
    facts.hasRootManifest = true;
    manifests.push({ dir: '', pkg: rootPkg });
  }
  for (const e of visible) {
    if (!e.isDirectory()) continue;
    if (facts.packageDirs.length >= PACKAGE_DIRS_MAX) break;
    const pkg = await readManifest(root, `${e.name}/package.json`);
    if (!pkg) continue;
    facts.packageDirs.push(e.name);
    manifests.push({ dir: e.name, pkg });
  }

  const scripts: ScriptFact[] = [];
  for (const { dir, pkg } of manifests) {
    for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
      if (scripts.length >= SCRIPTS_MAX) break;
      scripts.push({ dir, name, command: command.slice(0, SCRIPT_COMMAND_MAX) });
    }
    for (const dep of [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]) {
      const label = Object.hasOwn(STACK_DEPENDENCIES, dep) ? STACK_DEPENDENCIES[dep] : undefined;
      if (label) pushUnique(facts.stack, label);
    }
  }
  facts.scripts = scripts;

  for (const [file, label] of STACK_FILES) {
    if (await exists(root, file)) pushUnique(facts.stack, label);
  }

  // A `packageManager` field wins over the lockfile; npm is the default.
  let pm: PackageManager | null = packageManagerFrom(rootPkg?.packageManager);
  if (!pm) {
    for (const [lock, name] of LOCKFILES) {
      if (await exists(root, lock)) {
        pm = name;
        break;
      }
    }
  }
  facts.packageManager = pm ?? 'npm';

  facts.envExample = await firstExisting(root, ENV_EXAMPLE_NAMES);
  facts.composeFile = await firstExisting(root, COMPOSE_FILE_NAMES);
  return facts;
}
