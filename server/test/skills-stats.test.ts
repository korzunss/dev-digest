import { describe, it, expect } from 'vitest';
import {
  acceptRate,
  buildSkillStats,
  countByCategory,
  ratio,
  rollupForList,
} from '../src/modules/skills/stats.js';
import type { SkillFindingRow } from '../src/modules/skills/repository.js';

/**
 * The pure half of the Stats tab. The rules worth pinning are all about the
 * difference between "no data" and "zero" — a skill nobody has run is not a
 * skill everybody rejects.
 */

const f = (over: Partial<SkillFindingRow> = {}): SkillFindingRow => ({
  skillId: 'sk1',
  category: 'bug',
  accepted: false,
  dismissed: false,
  ...over,
});

describe('ratio', () => {
  it('divides', () => {
    expect(ratio(7, 10)).toBeCloseTo(0.7);
  });

  it('is null on a zero denominator — never 0', () => {
    // A skill in a workspace with no completed runs has no pull rate. Rendering
    // that as 0% would read as "never pulled", which is a different claim.
    expect(ratio(0, 0)).toBeNull();
    expect(ratio(3, 0)).toBeNull();
  });
});

describe('acceptRate', () => {
  it('counts accepted over ACTED findings', () => {
    const rows = [f({ accepted: true }), f({ dismissed: true }), f({ accepted: true })];
    expect(acceptRate(rows)).toBeCloseTo(2 / 3);
  });

  it('ignores pending findings rather than treating them as rejections', () => {
    // Otherwise a review nobody has triaged yet drags the rate to zero.
    const rows = [f({ accepted: true }), f(), f(), f()];
    expect(acceptRate(rows)).toBe(1);
  });

  it('is null when nothing has been acted on', () => {
    expect(acceptRate([f(), f()])).toBeNull();
    expect(acceptRate([])).toBeNull();
  });

  it('treats a finding that is somehow both as accepted', () => {
    expect(acceptRate([f({ accepted: true, dismissed: true })])).toBe(1);
  });
});

describe('countByCategory', () => {
  it('counts per category and omits the ones with nothing', () => {
    const rows = [f({ category: 'bug' }), f({ category: 'security' }), f({ category: 'bug' })];
    expect(countByCategory(rows)).toEqual({ bug: 2, security: 1 });
  });

  it('is an empty object, not a zero-filled one', () => {
    expect(countByCategory([])).toEqual({});
  });
});

describe('buildSkillStats', () => {
  it('reports exact agent figures and transitive run figures', () => {
    const stats = buildSkillStats({
      skillId: 'sk1',
      agents: [
        { id: 'a1', name: 'Security Reviewer' },
        { id: 'a2', name: 'Test Quality Reviewer' },
      ],
      runsWithSkill: 7,
      runsTotal: 10,
      findings: [f({ accepted: true }), f({ dismissed: true, category: 'perf' })],
    });

    expect(stats).toMatchObject({
      skill_id: 'sk1',
      agent_count: 2,
      runs_with_skill: 7,
      runs_total: 10,
      findings_30d: 2,
      findings_by_category: { bug: 1, perf: 1 },
    });
    expect(stats.pull_rate).toBeCloseTo(0.7);
    expect(stats.accept_rate).toBeCloseTo(0.5);
    expect(stats.agents.map((a) => a.name)).toEqual([
      'Security Reviewer',
      'Test Quality Reviewer',
    ]);
  });

  it('a skill nobody has run reports nulls, not zeros', () => {
    const stats = buildSkillStats({
      skillId: 'sk1',
      agents: [],
      runsWithSkill: 0,
      runsTotal: 0,
      findings: [],
    });
    expect(stats.pull_rate).toBeNull();
    expect(stats.accept_rate).toBeNull();
    expect(stats.agent_count).toBe(0);
    expect(stats.findings_30d).toBe(0);
  });

  it('an attached-but-never-pulled skill has a real 0 pull rate', () => {
    // The denominator exists here — runs happened, this skill was in none of
    // them. That IS zero, and must not be flattened into null.
    const stats = buildSkillStats({
      skillId: 'sk1',
      agents: [{ id: 'a1', name: 'A' }],
      runsWithSkill: 0,
      runsTotal: 12,
      findings: [],
    });
    expect(stats.pull_rate).toBe(0);
  });
});

describe('rollupForList', () => {
  it('produces the rail card footer', () => {
    expect(rollupForList(3, 5, 10, [f({ accepted: true }), f({ dismissed: true })])).toEqual({
      agent_count: 3,
      pull_rate: 0.5,
      accept_rate: 0.5,
    });
  });

  it('keeps an unused skill rate null', () => {
    expect(rollupForList(0, 0, 0, [])).toEqual({
      agent_count: 0,
      pull_rate: null,
      accept_rate: null,
    });
  });
});
