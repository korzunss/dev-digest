import type { SkillType } from "@devdigest/shared";

export const MODAL_WIDTH = 620;

export const DEFAULT_TYPE: SkillType = "custom";

/** Labels resolve under `skills.listItem.type.*`, so this is order only. */
export const TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];
