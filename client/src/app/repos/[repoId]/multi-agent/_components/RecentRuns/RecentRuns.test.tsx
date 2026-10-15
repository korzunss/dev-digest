/* RecentRuns — AC-15b…f. Pure props; no hooks to mock. */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { MultiAgentRunSummary } from "@devdigest/shared";
import runs from "../../../../../../../messages/en/runs.json";
import { RecentRuns } from "./RecentRuns";

afterEach(cleanup);

const summary = (over: Partial<MultiAgentRunSummary>): MultiAgentRunSummary => ({
  id: "m1",
  pr_id: "pr-1",
  pr_number: 7,
  pr_title: "Fix auth",
  ran_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  status: "done",
  agent_count: 2,
  agent_names: ["Security", "Style"],
  total_duration_ms: 9000,
  total_cost_usd: 0.06,
  total_cost_partial: false,
  ...over,
});

function renderIt(list: MultiAgentRunSummary[]) {
  const view = (l: MultiAgentRunSummary[]) => (
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <RecentRuns repoId="r1" runs={l} />
    </NextIntlClientProvider>
  );
  const r = render(view(list));
  return (l: MultiAgentRunSummary[]) => r.rerender(view(l));
}

describe("RecentRuns", () => {
  it("lists runs in the given order with PR, agents, status, time and cost; each row links to its results (AC-15b, 15c, 15e)", () => {
    renderIt([
      summary({}),
      summary({ id: "m2", pr_number: 9, pr_title: "Cache", status: "running", agent_count: 4, agent_names: ["A", "B", "C", "D"], total_cost_usd: 0.1, total_cost_partial: true }),
    ]);
    const rows = screen.getAllByRole("link");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute("href", "/repos/r1/multi-agent/m1");
    expect(rows[1]).toHaveAttribute("href", "/repos/r1/multi-agent/m2");
    const first = within(rows[0]!);
    expect(first.getByText("#7")).toBeInTheDocument();
    expect(rows[0]!.textContent).toContain("Fix auth");
    expect(first.getByText("Security, Style")).toBeInTheDocument();
    expect(first.getByText("done")).toBeInTheDocument();
    expect(first.getByText("9.0s")).toBeInTheDocument();
    expect(first.queryByText("3h")).toBeNull();
    expect(first.getByText("$0.06")).toBeInTheDocument();
    const second = within(rows[1]!);
    expect(second.getByText("4 agents")).toBeInTheDocument();
    expect(second.getByText("running")).toBeInTheDocument();
    expect(second.getByTitle("partial — some agents report no cost")).toBeInTheDocument();
  });

  it("shows an em dash for the time while the duration is null, and a deleted agent as 'Deleted agent'", () => {
    renderIt([summary({ status: "running", total_duration_ms: null, agent_names: ["Security", null] })]);
    const row = within(screen.getByRole("link"));
    expect(row.getByText("—")).toBeInTheDocument();
    expect(row.getByText("Security, Deleted agent")).toBeInTheDocument();
  });

  it("shows the empty copy, and a rerender with new data shows the new status (AC-15d, 15f)", () => {
    const rerender = renderIt([]);
    expect(screen.getByText("No multi-agent runs yet — runs you start appear here.")).toBeInTheDocument();
    rerender([summary({ status: "running" })]);
    expect(screen.getByText("running")).toBeInTheDocument();
    rerender([summary({ status: "partially_failed" })]);
    expect(screen.getByText("partially failed")).toBeInTheDocument();
    expect(screen.queryByText("running")).toBeNull();
  });
});
