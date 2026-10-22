import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Request budget: one GET per dashboard render, history pages share one window, idle hooks stay silent. */

const get = vi.fn();
vi.mock("../api", () => ({
  api: { get: (...a: unknown[]) => get(...a), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  ApiError: class extends Error {},
}));

import {
  useAgentPerfDashboard,
  useAgentPerfStats,
  useAgentRunHistory,
  useAgentStatsBreakdown,
  useRunsCount30d,
} from "./agent-performance";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

const item = (n: number) => ({
  run_id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  ran_at: "2026-10-19T10:00:00.000Z",
  pr_number: n,
  tokens: 10,
  cost_usd: 0.01,
  cost_source: "api",
  findings_count: 1,
  source: "local",
  has_trace: true,
});

beforeEach(() => get.mockReset());
afterEach(cleanup);

describe("agent-performance hooks", () => {
  it("sends one GET for a dashboard render, with the period, window and tz", async () => {
    get.mockResolvedValue({ rows: [] });
    const { wrapper } = setup();
    const { result } = renderHook(() => useAgentPerfDashboard({ period: "30d" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledTimes(1);
    const url = new URL(`http://x${get.mock.calls[0]![0] as string}`);
    expect(url.pathname).toBe("/agents/performance");
    expect(url.searchParams.get("period")).toBe("30d");
    expect(url.searchParams.get("tz")).toBeTruthy();
    expect(Date.parse(url.searchParams.get("to")!) - Date.parse(url.searchParams.get("from")!)).toBe(30 * 24 * 3_600_000);
  });

  it("Load more sends the same from/to plus the cursor", async () => {
    get.mockResolvedValueOnce({ items: [item(1)], next_cursor: "CUR" }).mockResolvedValueOnce({ items: [item(2)], next_cursor: null });
    const { wrapper } = setup();
    const { result } = renderHook(() => useAgentRunHistory("a1", { period: "1d" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(get).toHaveBeenCalledTimes(2);
    const first = new URL(`http://x${get.mock.calls[0]![0] as string}`).searchParams;
    const second = new URL(`http://x${get.mock.calls[1]![0] as string}`).searchParams;
    expect(first.get("cursor")).toBeNull();
    expect(second.get("cursor")).toBe("CUR");
    expect(second.get("from")).toBe(first.get("from"));
    expect(second.get("to")).toBe(first.get("to"));
    expect(first.get("limit")).toBe("50");
  });

  it("makes no request while disabled or without an agent id", () => {
    const { wrapper } = setup();
    renderHook(() => useAgentPerfStats(null, { period: "30d" }), { wrapper });
    renderHook(() => useAgentPerfStats("a1", { period: "30d" }, false), { wrapper });
    renderHook(() => useAgentRunHistory("a1", { period: "30d" }, false), { wrapper });
    renderHook(() => useRunsCount30d(null, false), { wrapper });
    expect(get).not.toHaveBeenCalled();
  });

  // AC-34/40: one request for all four panels, carrying the validated period, window and tz
  it("the breakdown hook sends one GET with period, from, to and tz, and none without an agent", async () => {
    get.mockResolvedValue({ counted_runs: 0 });
    const { wrapper } = setup();
    renderHook(() => useAgentStatsBreakdown(null, { period: "30d" }), { wrapper });
    expect(get).not.toHaveBeenCalled();
    const { result } = renderHook(() => useAgentStatsBreakdown("a1", { period: "1d" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledTimes(1);
    const url = new URL(`http://x${get.mock.calls[0]![0] as string}`);
    expect(url.pathname).toBe("/agents/a1/stats/breakdown");
    expect(url.searchParams.get("period")).toBe("1d");
    expect(url.searchParams.get("tz")).toBeTruthy();
    expect(Date.parse(url.searchParams.get("to")!) - Date.parse(url.searchParams.get("from")!)).toBe(24 * 3_600_000);
  });

  // AC-2: a period change is a new request, not a cached answer for the old period
  it("the breakdown hook refetches when the period changes", async () => {
    get.mockResolvedValue({ counted_runs: 0 });
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ period }: { period: "1d" | "30d" }) => useAgentStatsBreakdown("a1", { period }),
      { wrapper, initialProps: { period: "1d" as "1d" | "30d" } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ period: "30d" });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(new URL(`http://x${get.mock.calls[1]![0] as string}`).searchParams.get("period")).toBe("30d");
  });

  it("asks for the 30-day count of one agent when enabled", async () => {
    get.mockResolvedValue({ runs: 42 });
    const { wrapper } = setup();
    const { result } = renderHook(() => useRunsCount30d("a1", true), { wrapper });
    await waitFor(() => expect(result.current.data?.runs).toBe(42));
    const url = new URL(`http://x${get.mock.calls[0]![0] as string}`);
    expect(url.pathname).toBe("/agents/performance/runs-count");
    expect(url.searchParams.get("agent_id")).toBe("a1");
    expect(url.searchParams.get("period")).toBe("30d");
  });
});
