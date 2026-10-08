/**
 * Onboarding — grounding of the model output. Pure, no I/O.
 *
 * The model is a writer, never an authority: it does not order paths, does not
 * add files and cannot add a command outside the allowlist. Everything it says
 * is checked against what the index and the clone facts actually contain, and
 * anything that fails is dropped rather than repaired.
 */
import type {
  OnboardingAvailability,
  OnboardingCommand,
  OnboardingFileRow,
  OnboardingTask,
  OnboardingUnavailableCause,
} from '@devdigest/shared';
import {
  FIRST_TASKS_MAX,
  PACKAGE_DIR_RE,
  PACKAGE_MANAGERS,
  PM_BUILTINS,
  TWO_TOKEN_SCRIPTS,
} from './constants.js';
import { normalisePath } from './helpers.js';
import type { OnboardingLlmOutput, ScriptFact } from './types.js';

export interface GroundingContext {
  /** Normalised paths the index knows (the file-rank lookup of every cited task file). */
  indexed: Set<string>;
  hasIndex: boolean;
  /** Cause shown for first tasks when there is no index; null falls back to `index_failed`. */
  indexCause: OnboardingUnavailableCause | null;
  readingRows: OnboardingFileRow[];
  criticalRows: OnboardingFileRow[];
  scriptsByDir: Map<string, Set<string>>;
  packageDirs: string[];
  envExample: string | null;
  composeFile: string | null;
  deterministicCommands: OnboardingCommand[];
}

export interface GroundedTour {
  architecture: { body: string; diagram: string | null };
  criticalRows: OnboardingFileRow[];
  readingRows: OnboardingFileRow[];
  commands: OnboardingCommand[];
  firstTasks: { availability: OnboardingAvailability; tasks: OnboardingTask[] };
}

const REASON_MAX = 300;
const NOTE_MAX = 200;
const COMMANDS_MAX = 12;
/** A script name that could never smuggle a shell metacharacter, even if it is in the facts. */
const SAFE_SCRIPT_RE = /^[A-Za-z0-9:_.-]+$/;

export function scriptsByDirOf(scripts: ScriptFact[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const s of scripts) {
    const set = out.get(s.dir) ?? new Set<string>();
    set.add(s.name);
    out.set(s.dir, set);
  }
  return out;
}

// ---- text ---------------------------------------------------------------------

// `![alt](url)` and `![alt][ref]`, tolerating one level of brackets in the alt text (AC-34).
const INLINE_OR_REF_IMAGE_RE = /!\[(?:[^[\]]|\[[^\]]*\])*\](?:\([^)]*\)|\[[^\]]*\])/g;
// Shortcut `![alt]` (its definition `[alt]: url` may sit on another line, even in a quote):
// any `![…]` not followed by `(` or `[`. Applied after the two forms above.
const SHORTCUT_IMAGE_RE = /!\[(?:[^[\]]|\[[^\]]*\])*\](?![([])/g;
const HTML_IMG_RE = /<img\b[^>]*>?/gi;

/** Remove Markdown images (inline, reference, shortcut) and `<img>` tags: the tour never loads a remote picture. */
export function stripImages(text: string): string {
  return text
    .replace(INLINE_OR_REF_IMAGE_RE, '')
    .replace(SHORTCUT_IMAGE_RE, '')
    .replace(HTML_IMG_RE, '');
}

function cleanText(text: string, max?: number): string {
  const out = stripImages(text).trim();
  return max === undefined ? out : out.slice(0, max);
}

function cleanReason(text: string): string | null {
  const out = cleanText(text, REASON_MAX);
  return out === '' ? null : out;
}

// ---- diagram -------------------------------------------------------------------

/** AC-17: trim, drop ``` fences, keep only a flowchart/graph; anything else is no diagram. */
export function groundDiagram(raw: string): string | null {
  let d = raw.trim();
  d = d.replace(/^```[A-Za-z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  if (d === '') return null;
  return /^(flowchart|graph)\b/.test(d) ? d : null;
}

// ---- commands -------------------------------------------------------------------

function isPackageManager(token: string | undefined): boolean {
  return (PACKAGE_MANAGERS as readonly string[]).includes(token ?? '');
}

/**
 * AC-16 / X4: an allowlist, never a denylist. A command survives only when every
 * `&&`-separated part is exactly one of the accepted forms; any other character
 * makes a part fail the exact token match.
 */
export function isAllowedCommand(command: string, ctx: GroundingContext): boolean {
  const parts = command.trim().split('&&').map((p) => p.trim());
  if (parts.length === 0 || parts.some((p) => p === '')) return false;
  let cwd = '';
  let ranSomething = false;
  for (const part of parts) {
    const tokens = part.split(/ +/);
    const [head, a, b] = tokens;
    if (head === 'cd') {
      if (tokens.length !== 2 || a === undefined || !PACKAGE_DIR_RE.test(a) || !ctx.packageDirs.includes(a)) {
        return false;
      }
      cwd = a;
      continue;
    }
    if (isPackageManager(head)) {
      const scripts = ctx.scriptsByDir.get(cwd) ?? new Set<string>();
      const isScript = (name: string | undefined): name is string =>
        name !== undefined && SAFE_SCRIPT_RE.test(name) && scripts.has(name);
      const ok =
        (tokens.length === 2 &&
          a !== undefined &&
          ((PM_BUILTINS as readonly string[]).includes(a) ||
            ((TWO_TOKEN_SCRIPTS as readonly string[]).includes(a) && isScript(a)))) ||
        (tokens.length === 3 && a === 'run' && isScript(b));
      if (!ok) return false;
      ranSomething = true;
      continue;
    }
    if (head === 'cp') {
      if (ctx.envExample === null || tokens.length !== 3 || a !== ctx.envExample || b !== '.env') {
        return false;
      }
      ranSomething = true;
      continue;
    }
    if (head === 'docker') {
      const compose = tokens[1] === 'compose' && tokens[2] === 'up';
      const tail = tokens.length === 3 || (tokens.length === 4 && tokens[3] === '-d');
      if (ctx.composeFile === null || !compose || !tail) return false;
      ranSomething = true;
      continue;
    }
    return false;
  }
  return ranSomething;
}

function groundCommands(
  output: OnboardingLlmOutput['run_locally'],
  ctx: GroundingContext,
): OnboardingCommand[] {
  const seen = new Set<string>();
  const out: OnboardingCommand[] = [];
  for (const c of output) {
    const command = c.command.trim();
    if (seen.has(command) || !isAllowedCommand(command, ctx)) continue;
    seen.add(command);
    const note = cleanText(c.note, NOTE_MAX);
    out.push({ command, note: note === '' ? null : note });
    if (out.length >= COMMANDS_MAX) break;
  }
  return out.length > 0 ? out : ctx.deterministicCommands;
}

// ---- rows -----------------------------------------------------------------------

/** Deterministic rows and order stay; an LLM reason attaches by path, other LLM paths drop (AC-5, 6, 14). */
function attachReasons(
  rows: OnboardingFileRow[],
  llm: Array<{ path: string; reason: string }>,
): OnboardingFileRow[] {
  const reasons = new Map<string, string>();
  for (const r of llm) {
    const p = normalisePath(r.path);
    const reason = cleanReason(r.reason);
    if (reason !== null && !reasons.has(p)) reasons.set(p, reason);
  }
  return rows.map((row) => ({ ...row, reason: reasons.get(row.path) ?? row.reason }));
}

// ---- first tasks ----------------------------------------------------------------

function groundTasks(
  output: OnboardingLlmOutput['first_tasks'],
  ctx: GroundingContext,
): GroundedTour['firstTasks'] {
  const tasks: OnboardingTask[] = [];
  for (const t of output) {
    const files = [...new Set(t.files.map(normalisePath))].filter((f) => ctx.indexed.has(f));
    const title = cleanText(t.title);
    const body = cleanText(t.body);
    if (files.length === 0 || title === '' || body === '') continue; // AC-15
    tasks.push({ title, body, files });
    if (tasks.length >= FIRST_TASKS_MAX) break;
  }
  if (tasks.length > 0) {
    return { availability: { available: true, cause: null, reason: null }, tasks };
  }
  const cause: OnboardingUnavailableCause = ctx.hasIndex
    ? 'model_failed'
    : (ctx.indexCause ?? 'index_failed');
  return { availability: { available: false, cause, reason: null }, tasks: [] };
}

// ---- entry point ----------------------------------------------------------------

export function groundTour(output: OnboardingLlmOutput, ctx: GroundingContext): GroundedTour {
  return {
    architecture: {
      body: cleanText(output.architecture.body),
      diagram: groundDiagram(output.architecture.diagram),
    },
    criticalRows: attachReasons(ctx.criticalRows, output.critical_paths),
    readingRows: attachReasons(ctx.readingRows, output.reading_path),
    commands: groundCommands(output.run_locally, ctx),
    firstTasks: groundTasks(output.first_tasks, ctx),
  };
}
