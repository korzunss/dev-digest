import type { EvalSuiteCase } from "@devdigest/shared";

/** Message key (under `eval.skillTab`) for a refused suite start, or null when unknown. */
export function startRefusalKey(
  code: string | undefined,
): "runInProgress" | "suiteEmpty" | "suiteTooLarge" | "noApiKey" | null {
  if (code === "run_in_progress") return "runInProgress";
  if (code === "suite_empty") return "suiteEmpty";
  if (code === "suite_too_large") return "suiteTooLarge";
  if (code === "no_api_key") return "noApiKey";
  return null;
}

/** Newest case first (AC-81); ISO timestamps sort lexicographically. */
export const newestFirst = (cases: EvalSuiteCase[]): EvalSuiteCase[] =>
  [...cases].sort((a, b) => b.created_at.localeCompare(a.created_at));
