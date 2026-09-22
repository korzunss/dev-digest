import type { SkillType } from "@devdigest/shared";

/** Selectable skill types (labels are i18n'd in the component). */
export const TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Rows in the body textarea. Tall enough to read a rule without scrolling. */
export const BODY_ROWS = 18;

/** Rows in the description textarea — it is one or two sentences. */
export const DESCRIPTION_ROWS = 2;
