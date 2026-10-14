/* CaseRow — the shared eval case row: "ran on vN" appears only for a skill-case result (AC-83). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseResult, EvalSuiteCase } from "@devdigest/shared";
import evalMessages from "../../../messages/en/eval.json";
import { CaseRow } from "./CaseRow";

const result = (over: Partial<EvalCaseResult> = {}): EvalCaseResult => ({
  status: "passed", expected_count: 1, actual_count: 1, must_find_total: 1, must_find_matched: 1,
  noise: 0, kept: 1, dropped: 0, duration_ms: 10, cost_usd: 0, error: null,
  ran_at: "2026-10-12T10:00:00Z", findings: [], ...over,
});

const mkCase = (last_result: EvalCaseResult | null): EvalSuiteCase => ({
  id: "c1", agent_id: null, skill_id: "s1", name: "sql-injection",
  input: { diff: "d", files: [], pr_meta: null },
  expected: [{ expect: "must_find", file: "src/a.ts", start_line: 2, severity: "CRITICAL", category: "security" }],
  source: { finding_id: null, pr_id: null, repo_id: null, pr_number: null },
  created_at: "2026-10-12T09:00:00Z", updated_at: "2026-10-12T09:00:00Z", last_result,
});

function renderRow(c: EvalSuiteCase) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <CaseRow c={c} busy={false} onRun={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("CaseRow", () => {
  it("shows the skill version a result ran against", () => {
    renderRow(mkCase(result({ skill_version: 4, model: "gpt-x" })));
    expect(screen.getByText(/ran on v4/)).toBeInTheDocument();
  });

  it("shows no version line for an agent result or a never-run case", () => {
    const { unmount } = renderRow(mkCase(result({ agent_version: 3 })));
    expect(screen.queryByText(/ran on v/)).not.toBeInTheDocument();
    unmount();
    renderRow(mkCase(null));
    expect(screen.getAllByText("never run").length).toBeGreaterThan(0);
    expect(screen.queryByText(/ran on v/)).not.toBeInTheDocument();
  });
});
