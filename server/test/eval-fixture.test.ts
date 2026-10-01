import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseFixture } from '../src/modules/eval/fixture';

const raw = JSON.parse(
  readFileSync(new URL('../src/modules/eval/fixtures/pr-export-planted.json', import.meta.url), 'utf8'),
);

describe('review eval fixture', () => {
  it('parses the checked-in fixture with 12 planted issues per lane', () => {
    const f = parseFixture(raw);
    expect(f.issues).toHaveLength(12);
    const count = (lane: string) => f.issues.filter((i) => i.lane === lane).length;
    expect(count('security')).toBe(5);
    expect(count('performance')).toBe(2);
    expect(count('general')).toBe(4);
    expect(count('test_quality')).toBe(1);
  });

  it('maps every lane to a distinct agent name', () => {
    const f = parseFixture(raw);
    const names = Object.values(f.lanes);
    expect(names).toHaveLength(5);
    expect(new Set(names).size).toBe(5);
  });

  it('rejects a duplicate id', () => {
    const bad = structuredClone(raw);
    bad.acceptable_extras[0].id = bad.issues[0].id;
    expect(() => parseFixture(bad)).toThrow(/duplicate id/);
  });

  it('rejects end_line < start_line and names the path', () => {
    const bad = structuredClone(raw);
    bad.issues[0].locations[0].end_line = 1;
    bad.issues[0].locations[0].start_line = 5;
    expect(() => parseFixture(bad)).toThrow(/issues\.0\.locations\.0\.end_line/);
  });

  it('defaults false_positives to [] and accepts base_sha', () => {
    const f = parseFixture(raw);
    expect(f.false_positives).toEqual([]);
    expect(f.base_sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('rejects a duplicate id in false_positives and a bad base_sha', () => {
    const bad = structuredClone(raw);
    bad.false_positives = [structuredClone(bad.issues[0])];
    expect(() => parseFixture(bad)).toThrow(/duplicate id/);
    expect(() => parseFixture({ ...raw, base_sha: 'abc' })).toThrow(/base_sha/);
  });

  it('parses the PR #13 fixture: 0 issues, 15 false positives, 3 extras, general lane only', () => {
    const f = parseFixture(
      JSON.parse(
        readFileSync(new URL('../src/modules/eval/fixtures/pr13-general-false-criticals.json', import.meta.url), 'utf8'),
      ),
    );
    expect(f.issues).toHaveLength(0);
    expect(f.false_positives).toHaveLength(15);
    expect(f.acceptable_extras).toHaveLength(3);
    expect(Object.keys(f.lanes)).toEqual(['general']);
    expect(f.base_sha).toBe('6d6fb39dbaae8bd35f036d4fea036e07e96088f2');
    expect(f.head_sha).toBe('bda81c99219d718c3d0b96abe41597946e33b260');
  });
});
