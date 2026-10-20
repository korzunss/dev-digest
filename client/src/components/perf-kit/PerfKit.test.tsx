import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/agentPerformance.json";
import type { PerfCostSplit } from "@devdigest/shared/contracts/agent-performance.js";
import {
  AcceptRate,
  CostAmount,
  CostDelta,
  FailedRunsNote,
  PerfEmptyState,
  SafeSparkline,
  acceptTrend,
  formatDuration,
} from "./index";

/** M-9 small sample, M-13 delta, M-14 trend, D9 `~`, AC-8a note, AC-18a suggestion, and the one-point sparkline. */

afterEach(cleanup);

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );

const split = (api: number, estimate: number, unrecorded = 0): PerfCostSplit => ({
  api_usd: api,
  estimate_usd: estimate,
  unrecorded_usd: unrecorded,
});

describe("SafeSparkline", () => {
  it("renders a dot for one point and never NaN, a line for two, nothing for none", () => {
    const one = wrap(<SafeSparkline data={[3]} label="one run" />);
    expect(screen.getByRole("img", { name: "one run" })).toBeInTheDocument();
    expect(one.container.innerHTML).not.toContain("NaN");
    cleanup();
    const two = wrap(<SafeSparkline data={[1, 4]} label="two" />);
    expect(two.container.querySelector("path")).not.toBeNull();
    expect(two.container.innerHTML).not.toContain("NaN");
    cleanup();
    const none = wrap(<SafeSparkline data={[]} label="none" />);
    expect(none.container).toBeEmptyDOMElement();
  });
});

describe("AcceptRate", () => {
  it("marks n = 3 as a small sample and shows the arrow only when rates differ", () => {
    wrap(<AcceptRate rate={0.67} accepted={2} dismissed={1} previousRate={0.5} />);
    expect(screen.getByText("67%")).toBeInTheDocument();
    expect(screen.getByText("n = 3")).toBeInTheDocument();
    expect(screen.getByText("small sample")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Higher than/ })).toBeInTheDocument();
  });

  it("shows no small-sample mark from n = 10, and no arrow when equal or unknown", () => {
    wrap(<AcceptRate rate={0.5} accepted={5} dismissed={5} previousRate={0.5} />);
    expect(screen.queryByText("small sample")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(acceptTrend(0.5, null)).toBeNull();
    expect(acceptTrend(null, 0.5)).toBeNull();
  });

  it("says 'No decisions yet' instead of 0% at zero decisions", () => {
    wrap(<AcceptRate rate={null} accepted={0} dismissed={0} />);
    expect(screen.getByText("No decisions yet")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });
});

describe("AcceptRate colour (DG4)", () => {
  it("colours by the ring thresholds and stays neutral for a small sample", () => {
    wrap(<AcceptRate rate={0.9} accepted={9} dismissed={1} />);
    expect(screen.getByText("90%").style.color).toBe("var(--ok)");
    cleanup();
    wrap(<AcceptRate rate={0.6} accepted={6} dismissed={4} />);
    expect(screen.getByText("60%").style.color).toBe("var(--warn)");
    cleanup();
    wrap(<AcceptRate rate={0.2} accepted={2} dismissed={8} />);
    expect(screen.getByText("20%").style.color).toBe("var(--crit)");
    cleanup();
    wrap(<AcceptRate rate={1} accepted={1} dismissed={0} />);
    expect(screen.getByText("100%").style.color).toBe("var(--text-primary)");
  });
});

describe("CostAmount (D9 A)", () => {
  it("prefixes ~ when any part is an estimate, not when all parts are provider-reported", () => {
    wrap(<CostAmount value={1.5} split={split(1, 0.5)} />);
    expect(screen.getByText("~$1.50")).toBeInTheDocument();
    cleanup();
    wrap(<CostAmount value={1.5} split={split(1.5, 0)} />);
    expect(screen.getByText("$1.50")).toBeInTheDocument();
  });

  it("prints the split with an estimate prefix and an em dash for unknown cost", () => {
    wrap(<CostAmount value={1.5} split={split(1, 0.5)} showSplit />);
    expect(screen.getByText(/provider-reported \$1\.00 · DevDigest estimate ~\$0\.50/)).toBeInTheDocument();
    cleanup();
    wrap(<CostAmount value={null} split={split(0, 0)} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("CostDelta (M-13)", () => {
  it("shows a decrease as favourable and an increase as unfavourable, with ~ on an estimate figure", () => {
    wrap(<CostDelta current={8} previous={9.2} previousKnownRuns={3} split={split(8, 0)} />);
    expect(screen.getByText("−$1.20")).toHaveStyle({ color: "var(--ok)" });
    cleanup();
    wrap(<CostDelta current={5} previous={4} previousKnownRuns={3} split={split(4, 1)} />);
    expect(screen.getByText("+~$1.00")).toHaveStyle({ color: "var(--crit)" });
  });

  it("is omitted without a previous known cost", () => {
    const { container } = wrap(<CostDelta current={5} previous={null} previousKnownRuns={0} split={split(5, 0)} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("FailedRunsNote / PerfEmptyState", () => {
  it("shows no note at 0 and the count above it", () => {
    const zero = wrap(<FailedRunsNote count={0} />);
    expect(zero.container).toBeEmptyDOMElement();
    cleanup();
    wrap(<FailedRunsNote count={3} />);
    expect(screen.getByText("+3 failed runs not counted")).toBeInTheDocument();
  });

  it("offers 'Try 30 days — N runs' only when given a positive count, and selects it on click", () => {
    const onSelect = vi.fn();
    wrap(<PerfEmptyState failedRuns={2} tryThirty={{ runs: 42, onSelect }} />);
    expect(screen.getByText("No successful runs in this period")).toBeInTheDocument();
    expect(screen.getByText("+2 failed runs not counted")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try 30 days — 42 runs" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    cleanup();
    wrap(<PerfEmptyState failedRuns={0} tryThirty={{ runs: 0, onSelect }} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats seconds and treats unknown as an em dash", () => {
    expect(formatDuration(6200)).toBe("6.2s");
    expect(formatDuration(5000)).toBe("5s");
    expect(formatDuration(null)).toBe("—");
  });
});
