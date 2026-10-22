/* CostBreakdown — AC-17 / AC-17a: legends with amounts, null labels, per-segment provenance
   only when the chart mixes provenances, the empty text and the billing note (M-4). */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PerfSegment } from "@devdigest/shared/contracts/agent-performance.js";
import messages from "../../../../../messages/en/agentPerformance.json";
import { CostBreakdown } from "./CostBreakdown";
import { split } from "../AgentPerfTable/fixtures";

afterEach(cleanup);

const seg = (key: string, label: string | null, amount: number, s = split(amount)): PerfSegment => ({ key, label, amount_usd: amount, split: s });

const renderIt = (byAgent: PerfSegment[], byModel: PerfSegment[]) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
      <CostBreakdown byAgent={byAgent} byModel={byModel} />
    </NextIntlClientProvider>,
  );

describe("CostBreakdown", () => {
  it("lists each segment with its amount, naming null labels Deleted agents / Unknown model", () => {
    renderIt([seg("a", "Security Reviewer", 5.68), seg("d", null, 1)], [seg("m", null, 6.68)]);
    const agent = screen.getByRole("region", { name: "By agent" });
    expect(within(agent).getByText("Security Reviewer")).toBeInTheDocument();
    expect(within(agent).getByText("$5.68")).toBeInTheDocument();
    expect(within(agent).getByText("Deleted agents")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "By model" })).getByText("Unknown model")).toBeInTheDocument();
    expect(screen.getByText("Reconciled billing data is not available.")).toBeInTheDocument();
  });

  it("shows the estimated share with ~ and each segment's split only when provenances are mixed", () => {
    renderIt([seg("a", "Alpha", 2, split(0, 2)), seg("b", "Beta", 3, split(3, 0))], [seg("m", "gpt-4.1", 5, split(5))]);
    const agent = screen.getByRole("region", { name: "By agent" });
    expect(within(agent).getByText("~$2.00", { selector: "span.tnum" })).toBeInTheDocument();
    expect(within(agent).getByText(/DevDigest estimate/)).toBeInTheDocument();
    expect(within(agent).getByText(/provider-reported/)).toBeInTheDocument();
    // A single-provenance chart prints no split lines.
    expect(within(screen.getByRole("region", { name: "By model" })).queryByText(/provider-reported/)).not.toBeInTheDocument();
  });

  it("keeps the name readable when the split has two parts (DG1)", () => {
    renderIt([seg("a", "General Reviewer", 1.52, split(1.51, 0, 0.0023))], []);
    const name = screen.getByText("General Reviewer");
    expect(name).toBeInTheDocument();
    expect(Number(name.style.minWidth.replace("px", ""))).toBeGreaterThan(0);
    expect(screen.getByText(/source not recorded/)).toBeInTheDocument();
  });

  it("orders segments by amount descending, ties by label, null label last (DG5)", () => {
    renderIt([seg("d", null, 9), seg("b", "Beta", 2), seg("a", "Alpha", 2), seg("c", "Gamma", 5)], []);
    const agent = within(screen.getByRole("region", { name: "By agent" }));
    const names = agent.getAllByRole("listitem").map((li) => li.querySelector("span[title]")?.textContent);
    expect(names).toEqual(["Gamma", "Alpha", "Beta", "Deleted agents"]);
  });

  it("says 'No cost recorded in this period' for a chart with no segments", () => {
    renderIt([], []);
    expect(screen.getAllByText("No cost recorded in this period")).toHaveLength(2);
  });
});
