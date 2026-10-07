import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBriefView } from "@devdigest/shared";

/** The brief hooks: GET never POSTs, polling runs only while generating, a POST writes the cache. */

const get = vi.fn();
const post = vi.fn();
vi.mock("../api", () => ({
  api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a), put: vi.fn(), del: vi.fn() },
  ApiError: class extends Error {},
}));

import { useGeneratePrBrief, usePrBrief } from "./brief";

const view = (over: Partial<PrBriefView> = {}): PrBriefView => ({
  pr_id: "pr1",
  pr_head_sha: "abc",
  brief: null,
  stale: false,
  generating: false,
  failure: null,
  ...over,
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("brief hooks", () => {
  // reading the brief is a GET only, and an unset id does not even fetch
  it("fetches with GET, never POSTs, and stays idle without an id", async () => {
    get.mockResolvedValue(view());
    const { wrapper } = setup();
    const a = renderHook(() => usePrBrief("pr1"), { wrapper });
    await waitFor(() => expect(a.result.current.data).toBeDefined());
    expect(get).toHaveBeenCalledWith("/pulls/pr1/brief");
    expect(post).not.toHaveBeenCalled();

    get.mockClear();
    renderHook(() => usePrBrief(undefined), { wrapper });
    expect(get).not.toHaveBeenCalled();
  });

  // polling runs only while the server reports generating
  it("polls while generating and stops once done", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get.mockResolvedValueOnce(view({ generating: true })).mockResolvedValue(view());
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrBrief("pr1"), { wrapper });
    await waitFor(() => expect(result.current.data?.generating).toBe(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    await waitFor(() => expect(result.current.data?.generating).toBe(false));
    const calls = get.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(get.mock.calls.length).toBe(calls);
  });

  // the POST response is written straight into the cache under the same key
  it("writes the POST response into the cache", async () => {
    post.mockResolvedValue(view({ failure: "no_key" }));
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useGeneratePrBrief(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("pr1");
    });
    expect(post).toHaveBeenCalledWith("/pulls/pr1/brief");
    expect((qc.getQueryData(["pr-brief", "pr1"]) as PrBriefView).failure).toBe("no_key");
  });
});
