import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/**
 * The six tabs, in reading order: what the skill IS (config), what it reads
 * (context), what the agent sees (preview), whether it works (evals), how it is
 * doing (stats), and how it got here (versions).
 */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "tabs.config", icon: "Settings" },
  { key: "context", labelKey: "tabs.context", icon: "FileText" },
  { key: "preview", labelKey: "tabs.preview", icon: "Eye" },
  { key: "evals", labelKey: "tabs.evals", icon: "FlaskConical" },
  { key: "stats", labelKey: "tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "tabs.versions", icon: "History" },
];

/** The tab shown when `?tab=` is missing or not one of `TABS`. */
export const DEFAULT_TAB = "config";

/** The whitelist `?tab=` is checked against, derived from `TABS` so the two
    can never disagree. */
export const VALID_TABS: readonly string[] = TABS.map((t) => t.key);
