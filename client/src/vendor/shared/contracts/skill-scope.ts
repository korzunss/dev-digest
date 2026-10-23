import { z } from 'zod';
import { Skill, SkillVersion } from './knowledge.js';
import { RunTrace } from './trace.js';
import { EvalSuiteCase } from './eval-pipeline.js';

/**
 * Stack-scoped review guidance (spec 017): a skill's "Applies to" globs.
 * Deliberately NOT re-exported from `index.ts` — extending `Skill` here, not
 * editing `knowledge.ts`, keeps the agent-runner bundle unchanged. Import from
 * `@devdigest/shared/contracts/skill-scope.js`.
 */

export const SKILL_PATHS_MAX = 20;
export const SKILL_PATH_MAX_CHARS = 1024;

/** Raw "Applies to" globs on a save body; the server normalises and validates the rest. */
export const SkillPaths = z
  .array(z.string().max(SKILL_PATH_MAX_CHARS))
  .max(SKILL_PATHS_MAX, `Applies to holds at most ${SKILL_PATHS_MAX} globs`);
export type SkillPaths = z.infer<typeof SkillPaths>;

/** A skill with its globs. Empty `paths` = applies to every file. */
export const ScopedSkill = Skill.extend({ paths: z.array(z.string()) });
export type ScopedSkill = z.infer<typeof ScopedSkill>;

/** `paths` is nullish: a version written before this feature has none (restores as empty). */
export const ScopedSkillVersion = SkillVersion.extend({ paths: z.array(z.string()).nullish() });
export type ScopedSkillVersion = z.infer<typeof ScopedSkillVersion>;

/** One review call of a run: the files it saw and the skills injected into it. */
export const PromptGroup = z.object({
  label: z.string(),
  files: z.array(z.string()),
  skills: z.array(z.object({ name: z.string(), version: z.number().int().nullish() })),
  skipped: z.boolean(),
});
export type PromptGroup = z.infer<typeof PromptGroup>;

/** Nullish: traces stored before this feature carry no groups. */
export const RunTraceWithGroups = RunTrace.extend({ prompt_groups: z.array(PromptGroup).nullish() });
export type RunTraceWithGroups = z.infer<typeof RunTraceWithGroups>;

/** A skill eval case, flagged when none of its diff's files falls inside the skill's globs. */
export const EvalSkillSuiteCase = EvalSuiteCase.extend({ outside_applies_to: z.boolean() });
export type EvalSkillSuiteCase = z.infer<typeof EvalSkillSuiteCase>;
