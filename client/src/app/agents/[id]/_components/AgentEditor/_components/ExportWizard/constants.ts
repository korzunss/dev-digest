/* Constants for the Export Wizard. Closed sets of the shared contracts are
   mirrored here: the client takes no value imports from @devdigest/shared. */
import type { CiInstallErrorCode, CiPostAs, CiTrigger } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

export const STEP_KEYS = ["target", "preview", "configure", "install"] as const;
export const STEP_TARGET = 0;
export const STEP_PREVIEW = 1;
export const STEP_CONFIGURE = 2;
export const STEP_INSTALL = 3;

/** Only GitHub Actions is built; the other cards are shown disabled (spec 014). */
export const TARGETS: readonly { key: "gha" | "circle" | "jenkins" | "cli"; icon: IconName; enabled: boolean }[] = [
  { key: "gha", icon: "Workflow", enabled: true },
  { key: "circle", icon: "RefreshCw", enabled: false },
  { key: "jenkins", icon: "Settings", enabled: false },
  { key: "cli", icon: "Command", enabled: false },
];

export const TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize", "reopened"];
export const DEFAULT_TRIGGERS: readonly CiTrigger[] = ["opened", "synchronize"];

export const POST_AS_OPTIONS: readonly { value: CiPostAs; labelKey: "githubReview" | "prComment" | "none" }[] = [
  { value: "github_review", labelKey: "githubReview" },
  { value: "pr_comment", labelKey: "prComment" },
  { value: "none", labelKey: "none" },
];

/** Where the generated workflow lives in the file list (it is the only editable file). */
export const WORKFLOW_PATH = ".github/workflows/devdigest-review.yml";

export const ZIP_FILENAME = "devdigest-ci.zip";

export const DOCS_URL =
  "https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions";

/** Every code the install route can refuse with; anything else gets the generic message. */
export const KNOWN_ERROR_CODES: readonly CiInstallErrorCode[] = [
  "provider_not_openrouter",
  "manifest_invalid",
  "workflow_invalid",
  "token_missing",
  "missing_workflow_permission",
  "branch_protected",
  "foreign_commits",
  "branch_moved",
  "repo_not_github",
  "repo_has_other_agent",
];

/** Refusals where handing over a zip is a real way out (AC-29/59). */
export const ZIP_FALLBACK_CODES: readonly string[] = [
  "missing_workflow_permission",
  "branch_protected",
  "foreign_commits",
  "branch_moved",
];
