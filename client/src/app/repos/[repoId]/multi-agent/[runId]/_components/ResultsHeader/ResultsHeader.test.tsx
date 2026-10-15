/* ResultsHeader — AC-31, AC-32. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { MultiAgentRun } from "@devdigest/shared";
import runs from "../../../../../../../../messages/en/runs.json";
import { ResultsHeader } from "./ResultsHeader";

afterEach(cleanup);

const RUN = {
  id: "m1",
  pr_id: "p1",
  pr_number: 482,
  pr_title: "Add rate limiting",
  agent_count: 4,
  total_duration_ms: 8200,
  total_cost_usd: 0.2,
  total_cost_partial: false,
} as unknown as MultiAgentRun;

function renderIt(run: MultiAgentRun, over: Partial<{ onViewChange: () => void; onConfigure: () => void }> = {}) {
  const props = { onViewChange: vi.fn(), onConfigure: vi.fn(), ...over };
  render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <ResultsHeader run={run} view="columns" {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("ResultsHeader", () => {
  it("shows title, counts, PR, totals; Configure run and the switch call back", () => {
    const p = renderIt(RUN);
    expect(screen.getByRole("heading", { name: "Multi-Agent Review" })).toBeTruthy();
    expect(screen.getByText("4 selected agents · parallel")).toBeTruthy();
    expect(screen.getByText("#482")).toBeTruthy();
    expect(screen.getByText("Add rate limiting")).toBeTruthy();
    expect(screen.getByText(/4 agents · parallel fan-out · 8\.2s total · \$0\.20/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "columns" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "tabs" }));
    expect(p.onViewChange).toHaveBeenCalledWith("tabs");
    fireEvent.click(screen.getByRole("button", { name: "Configure run" }));
    expect(p.onConfigure).toHaveBeenCalled();
  });

  it("says running while the wall-clock total is unknown and marks a partial cost", () => {
    renderIt({ ...RUN, total_duration_ms: null, total_cost_partial: true });
    expect(screen.getByText(/running…/)).toBeTruthy();
    expect(screen.getByTitle("partial — some agents report no cost")).toBeTruthy();
  });
});
