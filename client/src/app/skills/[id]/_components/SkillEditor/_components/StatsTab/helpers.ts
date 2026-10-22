/** Pure helpers for the skill StatsTab. */
import type { DonutSegment } from "@devdigest/ui";
import type { SkillStatsPeriod } from "@devdigest/shared/contracts/skill-stats.js";
import { CATEGORY_COLOR, CATEGORY_FALLBACK_COLOR, formatCount } from "@/lib/finding-category";

/**
 * The tab is empty only when the skill is connected to NOTHING — no agent has
 * it attached and no run has EVER carried it (AC-47). The selected period does
 * not change this: a quiet period shows the tiles with "—", not this state.
 *
 * `agent_count` / `agents` are exact and exist independently of any run: a
 * skill attached to three agents genuinely is used by three agents even before
 * the first review. Hiding that behind an empty state would suppress the one
 * figure that is not a correlation.
 */
export function hasNothingToShow(stats: SkillStatsPeriod): boolean {
  return stats.agent_count === 0 && !stats.ever_used;
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

/** Kept under its old name for the Skill StatsTab; the formatter lives in `@/lib/finding-category`. */
export const formatSegmentValue = formatCount;
