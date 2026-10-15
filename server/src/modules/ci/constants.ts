/** Export-to-CI constants (spec 013, plan 40 DN2). */

/** The branch the export commits to; DevDigest may recreate it (GAP1). */
export const CI_BRANCH = 'devdigest/ci';
export const PR_TITLE = 'Add DevDigest CI review';
export const WORKFLOW_PATH = '.github/workflows/devdigest-review.yml';
/** File name GitHub lists runs under (`listWorkflowRuns`). */
export const WORKFLOW_FILE = 'devdigest-review.yml';
export const RUNNER_PATH = '.devdigest/runner/index.js';
export const MEMORY_PATH = '.devdigest/memory.jsonl';
/** Bumped when `generateWorkflow` output changes in a way that needs a re-export. */
export const WORKFLOW_VERSION = 1;
export const ARTIFACT_NAME = 'devdigest-result';
export const ARTIFACT_FILE = 'devdigest-result.json';
export const MAX_ZIP_BYTES = 1_048_576;
export const MAX_JSON_BYTES = 262_144;
export const LOOKBACK_DAYS = 30;
/** Runs per GitHub page, and the most pages one refresh reads for one repo. */
export const MAX_RUNS = 100;
export const MAX_RUN_PAGES = 3;
/** Files an export owns: a commit removes the ones of these kinds that it no longer ships. */
export const PRUNE_RULES = [
  { prefix: '.devdigest/agents/', suffix: '.yaml' },
  { prefix: '.devdigest/skills/', suffix: '.md' },
] as const;
/** Trailer on every commit DevDigest makes to `CI_BRANCH` (AC-67, GAP1). */
export const EXPORT_TRAILER = 'DevDigest-Export';

/** Full-SHA action pins (DN2). Re-check in the live acceptance check before release. */
export const ACTION_PINS = {
  checkout: { sha: '3d3c42e5aac5ba805825da76410c181273ba90b1', tag: 'v7.0.1' },
  setupNode: { sha: '949feb2413d6458794dcd2491c4babbbce0c15c1', tag: 'v7.1.0' },
  uploadArtifact: { sha: 'cf430e030ddbb5b0abf93d22962f4752f3646cd9', tag: 'v7.0.2' },
} as const;
