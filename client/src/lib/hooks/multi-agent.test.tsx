/* Multi-agent read hooks — live polling while a run is `running` (spec 013, AC-15d). */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { renderHook, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MultiAgentRunSummary } from "@devdigest/shared";

const get = vi.fn();
vi.mock("../api", () => ({ api: { get: (...a: unknown[]) => get(...a), post: vi.fn() } }));

import { useRecentMultiAgentRuns, useLatestMultiAgentRun } from "./multi-agent";

const POLL_MS = 3000;
// one poll plus the margin react-query's notify batching (setTimeout 0) needs to publish the result
const ONE_POLL = POLL_MS + 50;

const summary = (status: MultiAgentRunSummary["status"]): MultiAgentRunSummary => ({
  id: "m1",
  pr_id: "pr-1",
  pr_number: 7,
  pr_title: "Fix auth",
  ran_at: "2026-10-15T10:00:00.000Z",
  status,
  agent_count: 2,
  agent_names: ["Security", "Style"],
  total_duration_ms: null,
  total_cost_usd: null,
  total_cost_partial: false,
});

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
  vi.useFakeTimers();
  get.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useRecentMultiAgentRuns", () => {
  // while a listed run is running the list is re-read every 3 s, and the new status shows without a remount
  it("polls while a run is running and stops once none is (AC-15d)", async () => {
    get
      .mockResolvedValueOnce([summary("running")])
      .mockResolvedValueOnce([summary("done")])
      .mockResolvedValue([summary("done")]);
    const { result } = renderHook(() => useRecentMultiAgentRuns("r1"), { wrapper: wrapper(client()) });

    await vi.advanceTimersByTimeAsync(0);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/repos/r1/multi-agent-runs");
    expect(result.current.data?.[0]?.status).toBe("running");

    await vi.advanceTimersByTimeAsync(ONE_POLL);
    expect(get).toHaveBeenCalledTimes(2);
    expect(result.current.data?.[0]?.status).toBe("done");

    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(get).toHaveBeenCalledTimes(2);
  });

  // an all-settled (or empty) list is read once and never polled
  it("does not poll when nothing is running (AC-15d)", async () => {
    get.mockResolvedValue([summary("partially_failed")]);
    renderHook(() => useRecentMultiAgentRuns("r1"), { wrapper: wrapper(client()) });
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(get).toHaveBeenCalledTimes(1);
  });

  // no repo id, no request
  it("does not fetch without a repo id", async () => {
    renderHook(() => useRecentMultiAgentRuns(null), { wrapper: wrapper(client()) });
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(get).not.toHaveBeenCalled();
  });
});

describe("useLatestMultiAgentRun", () => {
  // the "Latest run for #N" status follows the run while it is running, then stops polling
  it("polls while the latest run is running and stops when it settles (AC-15d, 15g)", async () => {
    get
      .mockResolvedValueOnce({ run: summary("running") })
      .mockResolvedValue({ run: summary("failed") });
    const { result } = renderHook(() => useLatestMultiAgentRun("pr-1"), { wrapper: wrapper(client()) });

    await vi.advanceTimersByTimeAsync(0);
    expect(get).toHaveBeenCalledWith("/pulls/pr-1/multi-agent");
    expect(result.current.data?.run?.status).toBe("running");

    await vi.advanceTimersByTimeAsync(ONE_POLL);
    expect(result.current.data?.run?.status).toBe("failed");
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(get).toHaveBeenCalledTimes(2);
  });

  // a PR without a run is read once
  it("does not poll when the PR has no run", async () => {
    get.mockResolvedValue({ run: null });
    renderHook(() => useLatestMultiAgentRun("pr-1"), { wrapper: wrapper(client()) });
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
