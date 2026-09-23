/** Pure helpers for the skill StatsTab. */
import type { DonutSegment } from "@devdigest/ui";
import type { SkillStats } from "@devdigest/shared";
import { CATEGORY_COLOR, CATEGORY_FALLBACK_COLOR } from "./constants";

/**
 * The tab is empty only when the skill is connected to NOTHING — no agent has
 * it attached and no run has ever carried it.
 *
 * `agent_count` / `agents` are exact and exist independently of any run: a
 * skill attached to three agents genuinely is used by three agents even before
 * the first review. Hiding that behind an empty state would suppress the one
 * figure that is not a correlation.
 */
export function hasNothingToShow(stats: SkillStats): boolean {
  return stats.agent_count === 0 && stats.runs_with_skill === 0;
}

/** Findings per category as donut segments, biggest slice first. */
export function donutSegments(byCategory: Record<string, number>): DonutSegment[] {
  return Object.entries(byCategory)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({
      label,
      value,
      color: CATEGORY_COLOR[label] ?? CATEGORY_FALLBACK_COLOR,
    }));
}

/**
 * How the donut's legend renders a value. The chart's default is money
 * (`$12.00`); a count of findings is an integer, and "12.00" would be a
 * different claim about the data.
 */
export function formatSegmentValue(value: number): string {
  return value.toLocaleString("en-US");
}
