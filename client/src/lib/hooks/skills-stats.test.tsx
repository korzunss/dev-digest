import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/** Spec 016 AC-42/49: Skill → Stats asks the server for one period, with its window and zone. */

const get = vi.fn();
vi.mock("../api", () => ({
  api: { get: (...a: unknown[]) => get(...a), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  ApiError: class extends Error {},
}));

import { useSkillStats } from "./skills";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

beforeEach(() => {
  get.mockReset();
});
afterEach(cleanup);

describe("useSkillStats", () => {
  // the four query fields the server now requires are all present
  it("sends period, from, to and tz, and nothing without a skill id", async () => {
    get.mockResolvedValue({ skill_id: "s1" });
    const { wrapper } = setup();
    renderHook(() => useSkillStats(null, { period: "30d" }), { wrapper });
    expect(get).not.toHaveBeenCalled();
    const { result } = renderHook(() => useSkillStats("s1", { period: "1d" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledTimes(1);
    const url = new URL(`http://x${get.mock.calls[0]![0] as string}`);
    expect(url.pathname).toBe("/skills/s1/stats");
    expect(url.searchParams.get("period")).toBe("1d");
    expect(url.searchParams.get("tz")).toBeTruthy();
    expect(Date.parse(url.searchParams.get("to")!) - Date.parse(url.searchParams.get("from")!)).toBe(24 * 3_600_000);
  });

  // a period change must not be answered from the cache of the previous period
  it("refetches when the period changes", async () => {
    get.mockResolvedValue({ skill_id: "s1" });
    const { wrapper } = setup();
    const { result, rerender } = renderHook(({ period }: { period: "1d" | "30d" }) => useSkillStats("s1", { period }), {
      wrapper,
      initialProps: { period: "30d" as "1d" | "30d" },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ period: "1d" });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(new URL(`http://x${get.mock.calls[1]![0] as string}`).searchParams.get("period")).toBe("1d");
  });
});
