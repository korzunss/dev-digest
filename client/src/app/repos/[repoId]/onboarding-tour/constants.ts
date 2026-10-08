import type { IconName } from "@devdigest/ui";

/** Loading placeholder for the tour. */
export const SKELETON_COUNT = 4;
export const SKELETON_HEIGHT = 96;

/** The five sections, in spec order. `key` indexes `sections.*` in the messages. */
export const TOUR_SECTIONS = [
  { key: "architecture", id: "tour-architecture", icon: "Workflow" },
  { key: "criticalPaths", id: "tour-critical-paths", icon: "Target" },
  { key: "runLocally", id: "tour-run-locally", icon: "Play" },
  { key: "readingPath", id: "tour-reading-path", icon: "FileText" },
  { key: "firstTasks", id: "tour-first-tasks", icon: "ListChecks" },
] as const satisfies ReadonlyArray<{ key: string; id: string; icon: IconName }>;

export type TourSectionKey = (typeof TOUR_SECTIONS)[number]["key"];

/** Server codes the messages know; anything else falls back to the generic key. */
export const INDEX_REASON_CODES = ["no_data", "no_clone", "index_failed"] as const;
export const FAILURE_REASON_CODES = [
  "no_key",
  "no_model",
  "timeout",
  "invalid_output",
  "provider_error",
] as const;

/** Failure reasons the user fixes in Settings → Models. */
export const MODEL_SETTINGS_FAILURES: readonly string[] = ["no_key", "no_model"];
