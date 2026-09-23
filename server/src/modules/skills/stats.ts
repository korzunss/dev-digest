import type { SkillStats } from '@devdigest/shared';
import type { SkillFindingRow } from './repository.js';

/**
 * Pure rollups behind the Stats tab.
 *
 * Only `agent_count` / `agents` are exact. Everything else is measured over the
 * runs whose prompt CONTAINED the skill — the skill was present when a finding
 * appeared, which is not the same as having caused it. Nothing in the schema
 * attributes a finding to a skill, and the UI has to say so.
 */

/** Ratio, or null when the denominator is zero — "no data" is not "0%". */
export function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/**
 * Accept rate over ACTED findings only: pending ones are not evidence either
 * way, and counting them as rejections would make a fresh review look bad.
 */
export function acceptRate(rows: Pick<SkillFindingRow, 'accepted' | 'dismissed'>[]): number | null {
  const accepted = rows.filter((r) => r.accepted).length;
  const acted = accepted + rows.filter((r) => !r.accepted && r.dismissed).length;
  return ratio(accepted, acted);
}

/** Findings per category, skipping categories with no findings. */
export function countByCategory(rows: Pick<SkillFindingRow, 'category'>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.category] = (out[r.category] ?? 0) + 1;
  return out;
}

export interface BuildSkillStatsInput {
  skillId: string;
  agents: { id: string; name: string }[];
  runsWithSkill: number;
  runsTotal: number;
  findings: SkillFindingRow[];
}

export function buildSkillStats(input: BuildSkillStatsInput): SkillStats {
  return {
    skill_id: input.skillId,
    agent_count: input.agents.length,
    agents: input.agents,
    runs_with_skill: input.runsWithSkill,
    runs_total: input.runsTotal,
    pull_rate: ratio(input.runsWithSkill, input.runsTotal),
    accept_rate: acceptRate(input.findings),
    findings_30d: input.findings.length,
    findings_by_category: countByCategory(input.findings),
  };
}

/** The list endpoint's per-skill rollup — the rail card's footer line. */
export interface SkillListRollup {
  agent_count: number;
  pull_rate: number | null;
  accept_rate: number | null;
}

export function rollupForList(
  agentCount: number,
  runsWithSkill: number,
  runsTotal: number,
  findings: Pick<SkillFindingRow, 'accepted' | 'dismissed'>[],
): SkillListRollup {
  return {
    agent_count: agentCount,
    pull_rate: ratio(runsWithSkill, runsTotal),
    accept_rate: acceptRate(findings),
  };
}
