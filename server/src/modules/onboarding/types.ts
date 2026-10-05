/**
 * Internal types of the onboarding module. The wire DTOs (`OnboardingTour`,
 * `OnboardingTourView`, …) live in `@devdigest/shared`.
 */
import { z } from 'zod';
import type { OnboardingFileRow } from '@devdigest/shared';
import type { PackageManager } from './constants.js';

/** One package.json script, tagged with the directory it lives in ('' = root). */
export interface ScriptFact {
  dir: string;
  name: string;
  command: string;
}

/** What a read of the clone's manifests yields. Names and commands only — no file contents. */
export interface CloneFacts {
  /** Root listing: non-dot, non-symlink entries, dirs suffixed `/`. */
  structure: string[];
  stack: string[];
  packageManager: PackageManager;
  hasRootManifest: boolean;
  /** First-level real directories that carry their own package.json. */
  packageDirs: string[];
  scripts: ScriptFact[];
  envExample: string | null;
  composeFile: string | null;
}

export interface EndpointFact {
  path: string;
  endpoints: string[];
}

/** The bounded fact set the prompt is built from (no file contents). */
export interface OnboardingFacts {
  repoName: string;
  clone: CloneFacts;
  endpoints: EndpointFact[];
  readingRows: OnboardingFileRow[];
  criticalRows: OnboardingFileRow[];
  coverage: { filesIndexed: number; sourceFilesTotal: number | null; partial: boolean };
}

/**
 * What the model returns. Deliberately flat: strict json_schema providers reject
 * `.min/.max`, `.regex`, unions, `.nullable()` and `.optional()`; counts and
 * emptiness are enforced in grounding. An empty string means "no diagram"/"no note".
 */
export const OnboardingLlmOutput = z.object({
  architecture: z.object({ body: z.string(), diagram: z.string() }),
  critical_paths: z.array(z.object({ path: z.string(), reason: z.string() })),
  run_locally: z.array(z.object({ command: z.string(), note: z.string() })),
  reading_path: z.array(z.object({ path: z.string(), reason: z.string() })),
  first_tasks: z.array(
    z.object({ title: z.string(), body: z.string(), files: z.array(z.string()) }),
  ),
});
export type OnboardingLlmOutput = z.infer<typeof OnboardingLlmOutput>;
