import type { EvalCaseResult, EvalSuiteCase } from "@devdigest/shared";

/** Cases whose latest result passed — the "N / M passing" numerator (AC-20). */
export const passingCount = (cases: EvalSuiteCase[]): number =>
  cases.filter((c) => c.last_result?.status === "passed").length;

/** "severity · category" of the first expectation; null for an empty list (AC-19). */
export function expectationBadge(c: EvalSuiteCase): string | null {
  const first = c.expected[0];
  if (!first) return null;
  const parts = [first.severity, first.category].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(" · ") : first.expect;
}

/** Share of the must_find expectations a result matched, as a whole percent. */
export function caseRecall(r: EvalCaseResult | null): number | null {
  if (!r || r.status === "errored" || r.must_find_total === 0) return null;
  return Math.round((r.must_find_matched / r.must_find_total) * 100);
}
