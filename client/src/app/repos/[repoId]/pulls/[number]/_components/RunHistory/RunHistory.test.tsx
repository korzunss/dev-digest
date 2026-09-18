/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    cost_usd: null,
    cost_source: null,
    ...o,
  };
}

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "Line 12 contains a literal `sk_live_` Stripe secret key.",
    suggestion: null,
    confidence: 0.98,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — run cost (spec 001)", () => {
  it("a settled run shows total tokens and its cost", () => {
    renderRuns([
      run({ status: "done", tokens_in: 8_900, tokens_out: 219, cost_usd: 0.0013, cost_source: "api" }),
    ]);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("marks an ESTIMATED cost with a ~ so it can't pass as a reported price", () => {
    renderRuns([
      run({ status: "done", tokens_in: 8_900, tokens_out: 219, cost_usd: 0.0013, cost_source: "estimate" }),
    ]);
    expect(screen.getByText("9,119 tok · ~$0.0013")).toBeInTheDocument();
  });

  it("a run with no known cost shows an em dash, never $0.00", () => {
    renderRuns([run({ status: "done", tokens_in: 8_900, tokens_out: 219, cost_usd: null })]);
    expect(screen.getByText("9,119 tok · —")).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });

  it("a failed run shows no cost line at all (we never measured it)", () => {
    renderRuns([run({ status: "failed", error: "429 quota exceeded" })]);
    expect(screen.queryByText(/tok ·/)).not.toBeInTheDocument();
  });
});

describe("RunHistory — severity chips (spec 002)", () => {
  // The chips are tallied from these very findings, so the two can't disagree.
  const runFindings = new Map([
    [
      "run-1",
      [
        finding({ id: "f1", severity: "CRITICAL", title: "Hardcoded Stripe secret key" }),
        finding({ id: "f2", severity: "CRITICAL", title: "Lethal trifecta" }),
        finding({ id: "f3", severity: "WARNING", title: "N+1 query in user list endpoint" }),
        finding({ id: "f4", severity: "SUGGESTION", title: "Dismissed one", dismissed_at: "2026-09-18T00:00:00Z" }),
      ],
    ],
  ]);

  function renderWithCounts(props: Partial<React.ComponentProps<typeof RunHistory>> = {}) {
    return render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <RunHistory
          runs={[run({ status: "done", findings_count: 3, blockers: 2, score: 38 })]}
          findingsByRun={runFindings}
          // The timeline always passes a handler in practice, so the chips are
          // buttons — that is the shape these assertions query.
          onSelectSeverity={vi.fn()}
          onOpenTrace={() => {}}
          {...props}
        />
      </NextIntlClientProvider>,
    );
  }

  it("replaces '3 finding(s)' with a chip per level, keeping the blockers suffix", () => {
    renderWithCounts();
    expect(screen.queryByText(/3 finding/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/2 critical/)).toBeInTheDocument();
    expect(screen.getByLabelText(/1 warning/)).toBeInTheDocument();
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
  });

  it("reports the run and the level that were clicked", () => {
    const onSelectSeverity = vi.fn();
    renderWithCounts({ onSelectSeverity });
    fireEvent.click(screen.getByLabelText(/2 critical/));
    expect(onSelectSeverity).toHaveBeenCalledWith("run-1", "CRITICAL");
  });

  it("marks the level pressed only while the filter is scoped to THAT run", () => {
    renderWithCounts({ severity: "CRITICAL", scopedRunId: "run-1", onSelectSeverity: vi.fn() });
    expect(screen.getByLabelText(/2 critical/)).toHaveAttribute("aria-pressed", "true");
    cleanup();
    renderWithCounts({ severity: "CRITICAL", scopedRunId: "other-run", onSelectSeverity: vi.fn() });
    expect(screen.getByLabelText(/2 critical/)).toHaveAttribute("aria-pressed", "false");
  });

  it("previews that run's findings on hover, and agrees with its own chips", () => {
    renderWithCounts();
    fireEvent.mouseEnter(screen.getByLabelText(/2 critical/).parentElement!.parentElement!);
    // 4 findings in the map, one dismissed → the header and the chips both say 3.
    expect(screen.getByText("3 findings in this run")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list endpoint")).toBeInTheDocument();
    expect(screen.queryByText("Dismissed one")).not.toBeInTheDocument();
  });

  it("keeps the old count line for a run with no review to count (deleted / failed)", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <RunHistory
          runs={[run({ status: "done", findings_count: 3, blockers: 0 })]}
          findingsByRun={new Map()}
          onOpenTrace={() => {}}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("3 finding(s)")).toBeInTheDocument();
  });
});
