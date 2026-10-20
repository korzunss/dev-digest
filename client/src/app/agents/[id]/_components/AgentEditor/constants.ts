import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `agents` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Editor tabs. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" },
  { key: "context", labelKey: "editor.tabs.context", icon: "FileText" },
  { key: "evals", labelKey: "editor.tabs.evals", icon: "FlaskConical" },
  { key: "stats", labelKey: "editor.tabs.stats", icon: "Activity" },
  { key: "versions", labelKey: "editor.tabs.versions", icon: "History" },
  { key: "ci", labelKey: "editor.tabs.ci", icon: "GitBranch" },
];

/**
 * Max length of a version note. Mirrors the shared AGENT_VERSION_MESSAGE_MAX
 * (enforced by the server); not imported because the client must not take
 * VALUE imports from "@devdigest/shared" (next dev cannot resolve its re-exports).
 */
export const AGENT_NOTE_MAX = 500;
