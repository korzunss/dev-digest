/* BreakdownPanels — AC-1, 3/41, 7, 16, 21, 24, 26, 31, 32, 35, 36: the 2 × 2 grid, the
   hidden state, skeletons, per-slot retry, the copy, bars with empty buckets and the donut legend. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentStatsBreakdown } from "@devdigest/shared/contracts/agent-performance.js";
import agentPerformance from "../../../../../../../../../../messages/en/agentPerformance.json";
import prReview from "../../../../../../../../../../messages/en/prReview.json";

const get = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p) },
}));

import { ApiError } from "@/lib/api";
import { BreakdownPanels } from "./BreakdownPanels";

const AGENT_ID = "00000000-0000-4000-8000-000000000001";

const bucket = (i: number, over: Partial<AgentStatsBreakdown["findings"]["buckets"][number]> = {}) => ({
  start: new Date(Date.UTC(2026, 9, 11, i * 4)).toISOString(),
  end: new Date(Date.UTC(2026, 9, 11, i * 4 + 4)).toISOString(),
  critical: 0,
  warning: 0,
  suggestion: 0,
  other: 0,
  ...over,
});

const breakdown = (over: Partial<AgentStatsBreakdown> = {}): AgentStatsBreakdown => ({
  window: {
    period: "1d",
    from: "2026-10-11T00:00:00.000Z",
    to: "2026-10-12T00:00:00.000Z",
    previous_from: "2026-10-10T00:00:00.000Z",
    previous_to: "2026-10-11T00:00:00.000Z",
  },
  counted_runs: 4,
  local_runs: 4,
  skills: {
    tracked_since: "2026-10-01T00:00:00.000Z",
    denominator: 4,
    rows: [
      { skill_id: "00000000-0000-4000-8000-0000000000a1", name: "No .then() Chains", runs: 2 },
      { skill_id: "00000000-0000-4000-8000-0000000000a2", name: "Test Coverage Nudge", runs: 4 },
    ],
  },
  memory: { tracked_since: "2026-10-01T00:00:00.000Z", denominator: 4, rows: [{ text: "Prefer early returns", pr: 12, runs: 1 }] },
  findings: {
    total: 12,
    by_category: [
      { category: "bug", count: 7 },
      { category: "security", count: 2 },
      { category: "style", count: 1 },
      { category: "test", count: 2 },
    ],
    bucket_kind: "4h",
    buckets: [bucket(0), bucket(1, { critical: 1, warning: 3 }), bucket(2), bucket(3, { suggestion: 5, other: 1 }), bucket(4), bucket(5)],
  },
  ...over,
});

function renderPanels() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agentPerformance, prReview }}>
        <BreakdownPanels agentId={AGENT_ID} sel={{ period: "1d" }} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
});
afterEach(cleanup);

describe("BreakdownPanels", () => {
  it("shows four skeletons while loading (AC-35)", () => {
    get.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPanels();
    expect(container.querySelector('[aria-busy="true"]')!.children).toHaveLength(4);
  });

  it("draws the four panels with the AC-7 and AC-16 captions, sorted skills and the donut legend (AC-1, 7, 16, 24)", async () => {
    get.mockResolvedValue(breakdown());
    renderPanels();
    expect(await screen.findByText("Most-used skills")).toBeInTheDocument();
    expect(screen.getByText("Share of local runs whose prompt included the skill")).toBeInTheDocument();
    expect(screen.getByText("Share of runs where this entry was pulled into the prompt")).toBeInTheDocument();
    const names = screen.getAllByText(/Test Coverage Nudge|No \.then\(\) Chains/).map((n) => n.textContent);
    expect(names).toEqual(["Test Coverage Nudge", "No .then() Chains"]);
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("Prefer early returns")).toBeInTheDocument();
    expect(screen.getByText("7 · 58%")).toBeInTheDocument();
    expect(screen.getByText("perf")).toBeInTheDocument();
    expect(screen.getByText("12 findings in period")).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]![0]).toContain(`/agents/${AGENT_ID}/stats/breakdown?`);
  });

  it("keeps a label for every empty bucket and shows the detail on focus (AC-31, AC-32)", async () => {
    get.mockResolvedValue(breakdown());
    renderPanels();
    await screen.findByText("Findings by severity");
    for (const label of ["H1", "H2", "H3", "H4", "H5", "H6"]) expect(screen.getByText(label)).toBeInTheDocument();
    const cols = screen.getAllByRole("img").filter((e) => e.getAttribute("tabindex") === "0");
    expect(cols).toHaveLength(6);
    fireEvent.focus(cols[1]!);
    // The clock range depends on the machine's time zone; the label and counts do not.
    expect(within(document.body).getAllByText(/^H2: .+ · critical 1 · warning 3$/).length).toBeGreaterThan(0);
    // Other is in the legend only because it is > 0.
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  // AC-33: an unknown severity is its own segment and its own detail count, never merged into a known one
  it("draws Other as a separate segment and counts it in the bucket detail (AC-33)", async () => {
    get.mockResolvedValue(breakdown());
    const { container } = renderPanels();
    await screen.findByText("Findings by severity");
    const cols = screen.getAllByRole("img").filter((e) => e.getAttribute("tabindex") === "0");
    // Bucket 3 holds 5 suggestions and 1 other.
    expect(cols[3]!.getAttribute("aria-label")).toMatch(/suggestion 5 · Other 1$/);
    expect(cols[3]!.querySelector('[data-severity="other"]')).not.toBeNull();
    expect(cols[3]!.querySelector('[data-severity="suggestion"]')).not.toBeNull();
    // Bucket 1 has no unknown severity: no Other segment.
    expect(cols[1]!.querySelector('[data-severity="other"]')).toBeNull();
    expect(container.querySelectorAll('[data-severity="other"]')).toHaveLength(1);
  });

  // AC-33: the legend lists Other only when something is Other
  it("leaves Other out of the legend and the bars when no finding is Other (AC-33)", async () => {
    const d = breakdown();
    d.findings.buckets = [bucket(0), bucket(1, { critical: 1, warning: 3 }), bucket(2), bucket(3, { suggestion: 5 }), bucket(4), bucket(5)];
    get.mockResolvedValue(d);
    const { container } = renderPanels();
    await screen.findByText("Findings by severity");
    expect(screen.queryByText("Other")).not.toBeInTheDocument();
    expect(container.querySelector('[data-severity="other"]')).toBeNull();
  });

  // AC-41: the panels follow their own counted-run count, CI included, not the KPI request
  it("shows the panels for a CI-only response and never asks the KPI endpoints (AC-3, AC-41)", async () => {
    get.mockResolvedValue(breakdown({ counted_runs: 3, local_runs: 0 }));
    renderPanels();
    expect(await screen.findByText("Most-used skills")).toBeInTheDocument();
    expect(get.mock.calls.every((c) => (c[0] as string).includes("/stats/breakdown?"))).toBe(true);
  });

  it("renders nothing when the response counted 0 runs or the agent is 404 (AC-3, AC-41)", async () => {
    get.mockResolvedValue(breakdown({ counted_runs: 0 }));
    const { container } = renderPanels();
    await vi.waitFor(() => expect(get).toHaveBeenCalled());
    await vi.waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull());
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
    cleanup();

    get.mockRejectedValue(new ApiError("Agent not found", 404));
    const second = renderPanels();
    await vi.waitFor(() => expect(second.container.querySelector('[aria-busy="true"]')).toBeNull());
    await act(async () => {});
    expect(second.container).toBeEmptyDOMElement();
  });

  it("states CI-only agents and empty findings in the panels (AC-21, AC-26)", async () => {
    get.mockResolvedValue(
      breakdown({
        local_runs: 0,
        findings: { total: 0, by_category: [], bucket_kind: "4h", buckets: [bucket(0)] },
      }),
    );
    renderPanels();
    expect(await screen.findAllByText("No local runs in this period; CI runs record no skills or memory")).toHaveLength(2);
    expect(screen.getAllByText("CI runs record no findings")).toHaveLength(2);
  });

  it("states the local-run denominator when no skill was used (AC-10)", async () => {
    get.mockResolvedValue(breakdown({ skills: { tracked_since: "2026-10-01T00:00:00.000Z", denominator: 4, rows: [] } }));
    renderPanels();
    expect(await screen.findByText("No skills in this agent's prompts in this period")).toBeInTheDocument();
    expect(screen.getByText("based on 4 local runs")).toBeInTheDocument();
  });

  it("shows a retry in each slot on failure and refetches (AC-36)", async () => {
    get.mockRejectedValueOnce(new ApiError("boom", 500));
    get.mockResolvedValue(breakdown());
    renderPanels();
    const retries = await screen.findAllByRole("button", { name: "Retry" });
    expect(retries).toHaveLength(4);
    expect(screen.getAllByText("Could not load this panel.")).toHaveLength(4);
    fireEvent.click(retries[0]!);
    expect(await screen.findByText("Share of local runs whose prompt included the skill")).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });
});
