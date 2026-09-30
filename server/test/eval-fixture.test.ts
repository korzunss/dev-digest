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
});
