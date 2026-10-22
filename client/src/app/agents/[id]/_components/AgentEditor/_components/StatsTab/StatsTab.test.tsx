/* StatsTab — AC-20, 21, 25, 29: four tiles over one stats request, the empty state with
   "Try 30 days", the editor's not-found state on a 404, skeletons, and error + retry. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import type { AgentPerfStats, AgentStatsBreakdown, RunHistoryPage } from "@devdigest/shared/contracts/agent-performance.js";
import messages from "../../../../../../../../messages/en/agentPerformance.json";
import prReview from "../../../../../../../../messages/en/prReview.json";
import { figures, split } from "../../../../../../agent-performance/_components/AgentPerfTable/fixtures";

const get = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p) },
}));
vi.mock("@/components/run-trace-drawer", () => ({ default: () => null }));
const replace = vi.fn();
let params = "tab=stats";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/agents/ag1",
  useSearchParams: () => new URLSearchParams(params),
}));

import { ApiError } from "@/lib/api";
import { StatsTab } from "./StatsTab";

const AGENT_ID = "00000000-0000-4000-8000-000000000001";
const AGENT = { id: AGENT_ID, name: "Security Reviewer" } as Agent;

const window_ = {
  period: "30d" as const,
  from: "2026-09-19T00:00:00.000Z",
  to: "2026-10-19T00:00:00.000Z",
  previous_from: "2026-08-20T00:00:00.000Z",
  previous_to: "2026-09-19T00:00:00.000Z",
};

const stats = (over: Partial<AgentPerfStats> = {}): AgentPerfStats => ({
  window: window_,
  agent_id: AGENT_ID,
  agent_name: "Security Reviewer",
  figures: figures({ runs: 142, avg_cost_usd: 0.04, cost_split: split(5.68), avg_duration_ms: 6200, accepted: 78, dismissed: 22, accept_rate: 0.78 }),
  previous: { runs: 100, cost_known_runs: 100, total_cost_usd: 5, avg_cost_usd: 0.05, accept_rate: 0.7 },
  buckets: [
    { start: "2026-10-17T00:00", runs: 3 },
    { start: "2026-10-18T00:00", runs: 5 },
  ],
  ...over,
});

const emptyHistory: RunHistoryPage = { items: [], next_cursor: null };

const breakdown = (over: Partial<AgentStatsBreakdown> = {}): AgentStatsBreakdown => ({
  window: window_,
  counted_runs: 142,
  local_runs: 100,
  skills: { tracked_since: null, denominator: 0, rows: [] },
  memory: { tracked_since: null, denominator: 0, rows: [] },
  findings: { total: 0, by_category: [], bucket_kind: "7d", buckets: [] },
  ...over,
});

function serve(result: AgentPerfStats | Error, count = 42, panels: AgentStatsBreakdown | Error = breakdown()) {
  get.mockImplementation(async (path: string) => {
    if (path.startsWith("/agents/performance/runs-count")) return { runs: count };
    if (path.includes("/stats/breakdown")) {
      if (panels instanceof Error) throw panels;
      return panels;
    }
    if (path.includes("/stats/runs")) return emptyHistory;
    if (path.includes("/stats?")) {
      if (result instanceof Error) throw result;
      return result;
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages, prReview }}>
        <StatsTab agent={AGENT} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const paths = () => get.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  get.mockReset();
  replace.mockReset();
  params = "tab=stats";
});
afterEach(cleanup);

describe("StatsTab", () => {
  it("shows a skeleton first, then the four tiles from one stats request plus the first history page (AC-21)", async () => {
    serve(stats());
    renderTab();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    await screen.findByText("142");
    expect(screen.getByText("Avg cost / run")).toBeInTheDocument();
    expect(screen.getByText("$0.04")).toBeInTheDocument();
    expect(screen.getByText("6.2s")).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();
    expect(screen.getByText("Run history")).toBeInTheDocument();
    expect(paths().filter((p) => p.includes("/stats?"))).toHaveLength(1);
    expect(paths().some((p) => p.startsWith("/agents/performance/runs-count"))).toBe(false);
    expect(paths().filter((p) => p.includes("/stats/breakdown?"))).toHaveLength(1);
    expect(paths().length).toBeLessThanOrEqual(4);
  });

  it("replaces tiles and history with the empty state and offers Try 30 days on a short period (AC-25, AC-18a)", async () => {
    params = "tab=stats&period=1d";
    serve(stats({ figures: figures({ runs: 0, runs_not_counted: 2, total_cost_usd: null, avg_cost_usd: null, avg_duration_ms: null, accept_rate: null, accepted: 0, dismissed: 0, cost_known_runs: 0, cost_split: split() }) }));
    renderTab();
    await screen.findByText("No successful runs in this period");
    expect(screen.queryByText("Run history")).not.toBeInTheDocument();
    expect(screen.queryByText("Avg cost / run")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Try 30 days — 42 runs" }));
    expect(replace).toHaveBeenCalledTimes(1);
    const url = replace.mock.calls[0]![0] as string;
    expect(url).toContain("tab=stats");
    expect(url).toContain("period=30d");
  });

  it("shows the editor's not-found state on a 404 (AC-29) and a retry error on any other failure (AC-27)", async () => {
    serve(new ApiError("Agent not found", 404));
    renderTab();
    expect(await screen.findByText("Couldn’t load this agent")).toBeInTheDocument();
    expect(screen.getByText("Agent not found")).toBeInTheDocument();
    cleanup();

    serve(new ApiError("boom", 500));
    renderTab();
    expect(await screen.findByText("Could not load this agent's performance.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /30 days/ })).toBeInTheDocument();
    expect(screen.queryByText("Avg cost / run")).not.toBeInTheDocument();
  });
  it("keeps the panels beside the empty-period state, and asks at most four requests (AC-34, AC-37)", async () => {
    serve(stats({ figures: figures({ runs: 0, runs_not_counted: 0, total_cost_usd: null, avg_cost_usd: null, avg_duration_ms: null, accept_rate: null, accepted: 0, dismissed: 0, cost_known_runs: 0, cost_split: split() }) }));
    renderTab();
    await screen.findByText("No successful runs in this period");
    expect(await screen.findByText("Most-used skills")).toBeInTheDocument();
    expect(paths().length).toBeLessThanOrEqual(4);
  });

  // AC-34: on a full render the tab sends exactly one request per region, four at most
  it("sends one request each for the tiles, the panels, the history and the count, never more than four (AC-34)", async () => {
    serve(stats());
    renderTab();
    await screen.findByText("142");
    await screen.findByText("Most-used skills");
    await vi.waitFor(() => expect(paths().some((p) => p.includes("/stats/runs"))).toBe(true));
    expect(paths().length).toBeLessThanOrEqual(4);
    expect(paths().filter((p) => p.includes("/stats/breakdown?"))).toHaveLength(1);
    expect(paths().filter((p) => /\/stats\?/.test(p))).toHaveLength(1);
    expect(paths().filter((p) => p.includes("/stats/runs"))).toHaveLength(1);
  });

  it("keeps the panels when the stats request fails, and hides them on a 404 (AC-37, AC-3)", async () => {
    serve(new ApiError("boom", 500));
    renderTab();
    expect(await screen.findByText("Could not load this agent's performance.")).toBeInTheDocument();
    expect(await screen.findByText("Most-used skills")).toBeInTheDocument();
    cleanup();

    serve(new ApiError("Agent not found", 404), 42, new ApiError("Agent not found", 404));
    renderTab();
    expect(await screen.findByText("Couldn’t load this agent")).toBeInTheDocument();
    expect(screen.queryByText("Most-used skills")).not.toBeInTheDocument();
  });

  it("hides the panels when the breakdown counted no runs (AC-3, AC-41)", async () => {
    serve(stats(), 42, breakdown({ counted_runs: 0 }));
    renderTab();
    await screen.findByText("142");
    await vi.waitFor(() => expect(paths().some((p) => p.includes("/stats/breakdown?"))).toBe(true));
    expect(screen.queryByText("Most-used skills")).not.toBeInTheDocument();
  });
});
