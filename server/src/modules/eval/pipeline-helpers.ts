import { createHash } from 'node:crypto';
import { groundFindings } from '@devdigest/reviewer-core';
import {
  EvalExpectation,
  type EvalModelPick,
  type EvalSkillRef,
  type Finding,
  type LLMProvider,
  type Provider,
  type UnifiedDiff,
} from '@devdigest/shared';
import { AppError, ConfigError, ValidationError } from '../../platform/errors.js';
import {
  EVAL_MAX_DIFF_BYTES,
  EVAL_NAME_TITLE_MAX,
  EVAL_SKILL_HARNESS_PROMPT,
  EVAL_SKILL_STRATEGY,
} from './constants.js';
import type { EvalAgentSnapshot, EvalSkill } from './types.js';

/** Pure helpers for the eval pipeline (plan 34). Reasons are returned, never thrown. */

export type SeedKind = 'accepted' | 'dismissed';

export interface CaseRefusal {
  code:
    | 'name_empty'
    | 'name_taken'
    | 'diff_too_large'
    | 'diff_unparsable'
    | 'expected_invalid'
    | 'expectation_ungrounded';
  message: string;
  /** Index of the offending expectation, when one is to blame. */
  index?: number;
}

const kebab = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** `must-find-<title>` / `must-not-flag-<title>`, the title cut at a hyphen, `-2`… when taken. */
export function caseName(kind: SeedKind, title: string, taken: Iterable<string>): string {
  const prefix = kind === 'accepted' ? 'must-find-' : 'must-not-flag-';
  let part = kebab(title);
  if (part.length > EVAL_NAME_TITLE_MAX) {
    const head = part.slice(0, EVAL_NAME_TITLE_MAX);
    // A cut that lands on a hyphen keeps the whole head; otherwise back up to the last hyphen.
    const cutsWord = part[EVAL_NAME_TITLE_MAX] !== '-';
    const lastHyphen = head.lastIndexOf('-');
    part = cutsWord && lastHyphen > 0 ? head.slice(0, lastHyphen) : head.replace(/-+$/, '');
  }
  if (part === '') part = 'case';
  const used = new Set(taken);
  const base = `${prefix}${part}`;
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

export interface SeedFinding {
  file: string;
  start_line: number;
  end_line: number;
  title: string;
  severity: string;
  category: string;
}

/** The one expectation a draft starts with: `must_find` when accepted, else `must_not_flag`. */
export function seedExpectation(finding: SeedFinding, kind: SeedKind): EvalExpectation {
  return {
    expect: kind === 'accepted' ? 'must_find' : 'must_not_flag',
    file: finding.file,
    start_line: finding.start_line,
    end_line: finding.end_line,
    title: finding.title,
    severity: finding.severity,
    category: finding.category,
  };
}

export type NormaliseResult =
  | { ok: true; expected: EvalExpectation[] }
  | { ok: false; index: number | null; message: string };

/** Parse the expected output; `end_line` defaults to `start_line`. Names the failing element. */
export function normaliseExpectations(value: unknown): NormaliseResult {
  if (!Array.isArray(value)) {
    return { ok: false, index: null, message: 'expected output must be a JSON array' };
  }
  const expected: EvalExpectation[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const parsed = EvalExpectation.safeParse(value[i]);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      return { ok: false, index: i, message: `element ${i}: ${where}${issue?.message ?? 'invalid'}` };
    }
    expected.push({ ...parsed.data, end_line: parsed.data.end_line ?? parsed.data.start_line });
  }
  return { ok: true, expected };
}

export type ValidateResult =
  | { ok: true; diff: UnifiedDiff; files: string[]; expected: EvalExpectation[] }
  | ({ ok: false } & CaseRefusal);

export function validateCase(input: {
  diff: string;
  expected: unknown;
  name: string;
  takenNames: Iterable<string>;
  parseDiff: (raw: string) => UnifiedDiff;
}): ValidateResult {
  const name = input.name.trim();
  if (name === '') return { ok: false, code: 'name_empty', message: 'The case name is empty.' };
  if (new Set(input.takenNames).has(name)) {
    return { ok: false, code: 'name_taken', message: `The name "${name}" is already used in this suite.` };
  }
  if (Buffer.byteLength(input.diff, 'utf8') > EVAL_MAX_DIFF_BYTES) {
    return { ok: false, code: 'diff_too_large', message: `The diff is larger than ${EVAL_MAX_DIFF_BYTES} bytes.` };
  }

  let diff: UnifiedDiff;
  try {
    diff = input.parseDiff(input.diff);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, code: 'diff_unparsable', message: `The diff does not parse: ${msg}` };
  }
  if (diff.files.length === 0 || diff.files.every((f) => f.hunks.length === 0)) {
    return {
      ok: false,
      code: 'diff_unparsable',
      message: 'The diff has no file with a hunk. Paste a full unified diff with `diff --git` headers.',
    };
  }

  const norm = normaliseExpectations(input.expected);
  if (!norm.ok) {
    return {
      ok: false,
      code: 'expected_invalid',
      message: norm.message,
      ...(norm.index === null ? {} : { index: norm.index }),
    };
  }

  // Ground the expectations the same way findings are grounded: file in the diff,
  // lines on a new-side hunk line.
  const synthetic: Finding[] = norm.expected.map((e, i) => ({
    id: String(i),
    severity: 'SUGGESTION',
    category: 'bug',
    title: e.title ?? `expectation ${i}`,
    file: e.file,
    start_line: e.start_line,
    end_line: e.end_line ?? e.start_line,
    rationale: '',
    confidence: 1,
    kind: 'finding',
  }));
  const grounded = groundFindings(synthetic, diff);
  const bad = grounded.dropped[0];
  if (bad) {
    const index = Number(bad.finding.id);
    return {
      ok: false,
      code: 'expectation_ungrounded',
      index,
      message: `expectation ${index} (${bad.finding.file}:${bad.finding.start_line}-${bad.finding.end_line}): ${bad.reason}`,
    };
  }

  return { ok: true, diff, files: diff.files.map((f) => f.path), expected: norm.expected };
}

/** JSON with object keys sorted, so equal values hash equally. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** sha256 over the canonical JSON of what a draft run depends on. */
export function runTokenHash(input: {
  diff: string;
  expected: readonly EvalExpectation[];
  agentId: string;
  version: number;
  skills: readonly EvalSkillRef[];
}): string {
  return createHash('sha256').update(canonicalJson(input)).digest('hex');
}

/**
 * Run `tasks` with at most `limit` in flight; results keep task order.
 * On the first rejection no new task starts; every in-flight task settles
 * before the first error is rethrown.
 */
export async function pool<T>(limit: number, tasks: readonly (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  let failed = false;
  let firstError: unknown;
  const worker = async (): Promise<void> => {
    while (!failed && next < tasks.length) {
      const i = next;
      next += 1;
      try {
        results[i] = await tasks[i]!();
      } catch (err) {
        if (!failed) {
          failed = true;
          firstError = err;
        }
      }
    }
  };
  const width = Math.max(1, Math.min(Math.floor(limit), tasks.length));
  await Promise.all(Array.from({ length: width }, worker));
  if (failed) throw firstError;
  return results;
}

/** Postgres unique violation, bare or wrapped by the driver layer. */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === '23505' || e?.cause?.code === '23505';
}

const REFUSAL_FIELD: Record<CaseRefusal['code'], string> = {
  name_empty: 'name',
  name_taken: 'name',
  diff_too_large: 'input.diff',
  diff_unparsable: 'input.diff',
  expected_invalid: 'expected_output',
  expectation_ungrounded: 'expected_output',
};

export function refusalError(r: CaseRefusal): ValidationError {
  return new ValidationError(r.message, [
    { ...(r.index === undefined ? {} : { index: r.index }), field: REFUSAL_FIELD[r.code], message: r.message },
  ]);
}

/** The provider client, or a `no_api_key` refusal. Call it before anything is created or spent. */
export async function resolveProvider(
  llm: (provider: Provider) => Promise<LLMProvider>,
  provider: Provider,
): Promise<LLMProvider> {
  try {
    return await llm(provider);
  } catch (err) {
    if (err instanceof ConfigError) {
      throw new AppError('no_api_key', `no API key for ${provider}`, 422);
    }
    throw err;
  }
}

/**
 * The skill exactly as one skill-case run sees it: a fixed harness prompt (never
 * built from skill text) plus the skill's rendered body as the only skill.
 */
export function skillSnapshot(skill: EvalSkill, pick: EvalModelPick): EvalAgentSnapshot {
  return {
    owner: 'skill',
    id: skill.id,
    provider: pick.provider,
    model: pick.model,
    systemPrompt: EVAL_SKILL_HARNESS_PROMPT,
    strategy: EVAL_SKILL_STRATEGY,
    version: skill.version,
    skills: [{ id: skill.id, name: skill.name, version: skill.version }],
    rendered: [skill.rendered],
  };
}

/** sha256 over what a skill draft run depends on, including the picked provider and model. */
export function skillRunTokenHash(input: {
  diff: string;
  expected: readonly EvalExpectation[];
  skillId: string;
  version: number;
  provider: string;
  model: string;
}): string {
  return createHash('sha256').update(canonicalJson(input)).digest('hex');
}
