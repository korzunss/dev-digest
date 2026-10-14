import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import {
  caseName,
  normaliseExpectations,
  pool,
  resolveProvider,
  runTokenHash,
  skillRunTokenHash,
  skillSnapshot,
  seedExpectation,
  validateCase,
} from '../src/modules/eval/pipeline-helpers.js';
import { ConfigError } from '../src/platform/errors.js';
import { EVAL_MAX_DIFF_BYTES, EVAL_NAME_TITLE_MAX, EVAL_SKILL_HARNESS_PROMPT } from '../src/modules/eval/constants.js';

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,4 @@',
  ' one',
  '+two',
  '+three',
  ' four',
  '',
].join('\n');

const base = { diff: DIFF, name: 'n', takenNames: [] as string[], parseDiff: parseUnifiedDiff };

describe('caseName', () => {
  it('prefixes by kind and kebab-cases the title', () => {
    expect(caseName('accepted', 'SQL Injection in login!', [])).toBe('must-find-sql-injection-in-login');
    expect(caseName('dismissed', 'Unused var', [])).toBe('must-not-flag-unused-var');
  });
  it('cuts the title part at the last hyphen within the limit', () => {
    const title = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi';
    const name = caseName('accepted', title, []);
    const part = name.slice('must-find-'.length);
    expect(part.length).toBeLessThanOrEqual(EVAL_NAME_TITLE_MAX);
    expect(title.replace(/ /g, '-')).toContain(part);
    expect(part.endsWith('-')).toBe(false);
    expect(`${part}-`).toSatisfy((p: string) => title.replace(/ /g, '-').startsWith(p));
  });
  it('hard-cuts a single long word', () => {
    expect(caseName('accepted', 'x'.repeat(100), []).length).toBe('must-find-'.length + EVAL_NAME_TITLE_MAX);
  });
  it('adds -2, -3 when taken', () => {
    expect(caseName('accepted', 't', ['must-find-t'])).toBe('must-find-t-2');
    expect(caseName('accepted', 't', ['must-find-t', 'must-find-t-2'])).toBe('must-find-t-3');
  });
  it('falls back to "case" for an empty title', () => {
    expect(caseName('accepted', '!!!', [])).toBe('must-find-case');
  });
});

describe('seedExpectation', () => {
  const f = { file: 'a.ts', start_line: 2, end_line: 3, title: 'T', severity: 'WARNING', category: 'bug' };
  it('maps accepted to must_find and dismissed to must_not_flag, copying display fields', () => {
    expect(seedExpectation(f, 'accepted')).toEqual({ expect: 'must_find', ...f });
    expect(seedExpectation(f, 'dismissed').expect).toBe('must_not_flag');
  });
});

describe('normaliseExpectations', () => {
  it('defaults end_line to start_line', () => {
    expect(normaliseExpectations([{ expect: 'must_find', file: 'a.ts', start_line: 4 }])).toEqual({
      ok: true,
      expected: [{ expect: 'must_find', file: 'a.ts', start_line: 4, end_line: 4 }],
    });
  });
  it('accepts an empty array', () => {
    expect(normaliseExpectations([])).toEqual({ ok: true, expected: [] });
  });
  it('rejects a non-array', () => {
    expect(normaliseExpectations({})).toMatchObject({ ok: false, index: null });
  });
  it('names the offending element', () => {
    const r = normaliseExpectations([
      { expect: 'must_find', file: 'a.ts', start_line: 1 },
      { file: 'a.ts', start_line: 1 },
    ]);
    expect(r).toMatchObject({ ok: false, index: 1 });
    if (!r.ok) expect(r.message).toContain('element 1');
  });
  it('rejects unknown keys and reversed ranges', () => {
    expect(normaliseExpectations([{ expect: 'must_find', file: 'a', start_line: 1, x: 1 }])).toMatchObject({ ok: false, index: 0 });
    expect(normaliseExpectations([{ expect: 'must_find', file: 'a', start_line: 5, end_line: 2 }])).toMatchObject({ ok: false, index: 0 });
  });
});

describe('validateCase', () => {
  const ok = [{ expect: 'must_find', file: 'src/a.ts', start_line: 2 }];

  it('accepts a grounded case and returns the files', () => {
    const r = validateCase({ ...base, expected: ok });
    expect(r).toMatchObject({ ok: true, files: ['src/a.ts'] });
    if (r.ok) expect(r.expected[0]!.end_line).toBe(2);
  });
  it('accepts an empty expectation list', () => {
    expect(validateCase({ ...base, expected: [] }).ok).toBe(true);
  });
  it('refuses an empty or taken name', () => {
    expect(validateCase({ ...base, name: '  ', expected: ok })).toMatchObject({ ok: false, code: 'name_empty' });
    expect(validateCase({ ...base, takenNames: ['n'], expected: ok })).toMatchObject({ ok: false, code: 'name_taken' });
  });
  it('refuses a diff with no file or no hunk, including a hunks-only paste', () => {
    expect(validateCase({ ...base, diff: 'not a diff', expected: [] })).toMatchObject({ ok: false, code: 'diff_unparsable' });
    const hunksOnly = '@@ -1,2 +1,4 @@\n one\n+two\n';
    expect(validateCase({ ...base, diff: hunksOnly, expected: [] })).toMatchObject({ ok: false, code: 'diff_unparsable' });
  });
  it('turns a throwing parser into a reason', () => {
    const parseDiff = () => {
      throw new Error('boom');
    };
    expect(validateCase({ ...base, parseDiff, expected: [] })).toMatchObject({ ok: false, code: 'diff_unparsable' });
  });
  it('refuses a diff over the byte limit, measured in bytes', () => {
    const big = 'é'.repeat(EVAL_MAX_DIFF_BYTES / 2 + 1);
    expect(validateCase({ ...base, diff: big, expected: [] })).toMatchObject({ ok: false, code: 'diff_too_large' });
  });
  it('names the ungrounded expectation by index', () => {
    const r = validateCase({
      ...base,
      expected: [ok[0], { expect: 'must_not_flag', file: 'src/a.ts', start_line: 90 }],
    });
    expect(r).toMatchObject({ ok: false, code: 'expectation_ungrounded', index: 1 });
    expect(validateCase({ ...base, expected: [{ expect: 'must_find', file: 'other.ts', start_line: 2 }] })).toMatchObject({
      ok: false,
      code: 'expectation_ungrounded',
      index: 0,
    });
  });
  it('reports a malformed expectation as expected_invalid with its index', () => {
    expect(validateCase({ ...base, expected: [ok[0], { nope: true }] })).toMatchObject({
      ok: false,
      code: 'expected_invalid',
      index: 1,
    });
  });
});

describe('runTokenHash', () => {
  const input = { diff: 'd', expected: [], agentId: 'a', version: 1, skills: [{ id: 's', name: 'n', version: 1 }] };
  it('is stable and sensitive to every input', () => {
    const h = runTokenHash(input);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(runTokenHash({ ...input })).toBe(h);
    expect(runTokenHash({ ...input, diff: 'e' })).not.toBe(h);
    expect(runTokenHash({ ...input, version: 2 })).not.toBe(h);
    expect(runTokenHash({ ...input, agentId: 'b' })).not.toBe(h);
    expect(runTokenHash({ ...input, skills: [] })).not.toBe(h);
    expect(runTokenHash({ ...input, expected: [{ expect: 'must_find', file: 'a', start_line: 1 }] })).not.toBe(h);
  });
  it('ignores object key order', () => {
    const a = { expect: 'must_find' as const, file: 'a', start_line: 1 };
    const b = { start_line: 1, file: 'a', expect: 'must_find' as const };
    expect(runTokenHash({ ...input, expected: [a] })).toBe(runTokenHash({ ...input, expected: [b] }));
  });
});

describe('pool', () => {
  it('keeps order and never exceeds the limit', async () => {
    let live = 0;
    let peak = 0;
    const tasks = Array.from({ length: 8 }, (_, i) => async () => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5 * ((i % 3) + 1)));
      live -= 1;
      return i;
    });
    expect(await pool(3, tasks)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
  });
  it('handles no tasks and a limit below one', async () => {
    expect(await pool(3, [])).toEqual([]);
    expect(await pool(0, [async () => 1])).toEqual([1]);
  });
  it('on a rejection starts no new task and rethrows only after in-flight tasks settle', async () => {
    const events: string[] = [];
    const started: number[] = [];
    const task = (i: number, ms: number, fail = false) => async () => {
      started.push(i);
      await new Promise((r) => setTimeout(r, ms));
      events.push(`end${i}`);
      if (fail) throw new Error(`boom${i}`);
      return i;
    };
    const tasks = [task(0, 5, true), task(1, 40), task(2, 5), task(3, 5), task(4, 5)];
    await expect(pool(2, tasks)).rejects.toThrow('boom0');
    events.push('rejected');
    // The in-flight task 1 settles BEFORE the rejection surfaces …
    expect(events).toEqual(['end0', 'end1', 'rejected']);
    // … and no worker picks up another task afterwards (a bare Promise.all pool would start task 2).
    await new Promise((r) => setTimeout(r, 60));
    expect(started).toEqual([0, 1]);
  });
});

describe('skill helpers', () => {
  const skill = { id: 'sk1', name: 'My Skill', version: 3, enabled: true, rendered: '### Skill: My Skill\n\nBODY' };

  it('builds a skill snapshot with the fixed harness prompt and the skill as the only skill', () => {
    const snap = skillSnapshot(skill, { provider: 'openai', model: 'gpt-4.1' });
    expect(snap).toMatchObject({
      owner: 'skill',
      id: 'sk1',
      provider: 'openai',
      model: 'gpt-4.1',
      systemPrompt: EVAL_SKILL_HARNESS_PROMPT,
      version: 3,
      skills: [{ id: 'sk1', name: 'My Skill', version: 3 }],
      rendered: [skill.rendered],
    });
    expect(snap.systemPrompt).not.toContain('BODY');
  });

  it('skillRunTokenHash changes with the pick and the version', () => {
    const base = { diff: 'd', expected: [], skillId: 'sk1', version: 1, provider: 'openai', model: 'm' };
    const h = skillRunTokenHash(base);
    expect(skillRunTokenHash({ ...base })).toBe(h);
    expect(skillRunTokenHash({ ...base, model: 'm2' })).not.toBe(h);
    expect(skillRunTokenHash({ ...base, provider: 'anthropic' })).not.toBe(h);
    expect(skillRunTokenHash({ ...base, version: 2 })).not.toBe(h);
  });

  it('resolveProvider maps a missing key to a 422 no_api_key and rethrows anything else', async () => {
    await expect(
      resolveProvider(async () => {
        throw new ConfigError('missing');
      }, 'openai'),
    ).rejects.toMatchObject({ code: 'no_api_key', statusCode: 422 });
    await expect(
      resolveProvider(async () => {
        throw new Error('boom');
      }, 'openai'),
    ).rejects.toThrow('boom');
  });
});
