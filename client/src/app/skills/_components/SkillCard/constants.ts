import type { SkillSource, SkillType } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/**
 * One colour per skill type, from the same semantic tokens the findings use —
 * so "security" reads the same here as it does on a finding.
 */
export const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "var(--info)",
  convention: "var(--ok)",
  security: "var(--crit)",
  custom: "var(--text-secondary)",
};

/**
 * One icon per source. Provenance is the first thing to check on a skill — it
 * decides whether the body is trusted — and in a narrow rail the icon is
 * readable at a glance where the word is not.
 */
export const SOURCE_ICON: Record<SkillSource, IconName> = {
  manual: "Edit",
  imported_file: "Upload",
  imported_url: "Link",
  extracted: "Wrench",
  community: "Globe",
};

/** Em dash — what an absent rollup renders as. Never "0%". */
export const NO_VALUE = "—";
