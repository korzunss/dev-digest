import type { SkillType } from "@devdigest/shared";

/** Wider than the plain create form: this one carries a generated body. */
export const MODAL_WIDTH = 680;

/**
 * An extracted skill lands ENABLED, unlike an imported one.
 *
 * `defaultEnabledFor` deliberately parks imports disabled — they are somebody
 * else's text and want vetting first. These rules came out of this repo, were
 * grounded against its own files, and a person accepted each one card by card,
 * so the vetting already happened upstream of this modal.
 */
export const DEFAULT_ENABLED = true;

/** Labels resolve under `skills.listItem.type.*`, so this is order only. */
export const TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

/** Rows in the body editor — tall enough to read a rule and its evidence. */
export const BODY_ROWS = 14;

/** Placeholder bars while the preview is being built, sized like the form. */
export const SKELETON_COUNT = 4;
export const SKELETON_HEIGHT = 46;
