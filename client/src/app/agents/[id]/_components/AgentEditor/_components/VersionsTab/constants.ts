/** How a version's date reads — a fixed point in a changelog, so absolute. */
export const VERSION_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

/** Width of the diff modal — a unified diff wants the room. */
export const DIFF_WIDTH = 860;

/** Width of the restore confirmation. */
export const RESTORE_WIDTH = 520;

/** Leading characters of a skill id shown for a skill that was deleted before its name was recorded. */
export const SHORT_ID_LENGTH = 8;

/** Diff fields with a translated label. A closed set: the field name comes from the server. */
export const FIELD_LABEL_KEYS = {
  provider: "provider",
  model: "model",
  strategy: "strategy",
  ci_fail_on: "ci_fail_on",
  repo_intel: "repo_intel",
  output_schema: "output_schema",
} as const;

export type FieldLabelKey = keyof typeof FIELD_LABEL_KEYS;
