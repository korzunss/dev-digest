import { z } from 'zod';
import { PerfQuery } from './agent-performance.js';
import { SkillStats } from './knowledge.js';

/**
 * Skill → Stats with a period control (spec 016, AC-42…49). Deliberately NOT
 * re-exported from `index.ts`: `SkillStats` lives in `knowledge.ts`, which the
 * barrel re-exports, so a new field there would change the agent-runner bundle.
 * This file extends it instead. Import from
 * `@devdigest/shared/contracts/skill-stats.js`.
 */

/** The same window + zone as Agent → Stats; the server re-checks it (AC-49). */
export const SkillStatsQuery = PerfQuery;
export type SkillStatsQuery = z.infer<typeof SkillStatsQuery>;

/**
 * `SkillStats` figures scoped to the requested window, plus whether the skill
 * was ever recorded on a run (AC-47). `findings_30d` keeps its name and means
 * "findings in the requested window".
 */
export const SkillStatsPeriod = SkillStats.extend({ ever_used: z.boolean() });
export type SkillStatsPeriod = z.infer<typeof SkillStatsPeriod>;
