/* useRefreshOnRunsSettled — invalidates reviews + pr-runs only on the
   active-run count's 1 -> 0 transition (spec 007, S20, D15-A). */
import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { renderHook, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRefreshOnRunsSettled } from "./reviews";

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

afterEach(cleanup);

describe("useRefreshOnRunsSettled", () => {
  it("does not invalidate on a 0 -> 1 transition", () => {
    const qc = client();
    const spy = vi.spyOn(qc, "invalidateQueries");

    const { rerender } = renderHook(
      ({ activeCount }: { activeCount: number }) => useRefreshOnRunsSettled("pr1", activeCount),
      { wrapper: wrapper(qc), initialProps: { activeCount: 0 } },
    );
    rerender({ activeCount: 1 });

    expect(spy).not.toHaveBeenCalled();
  });

  it("invalidates reviews and pr-runs once on a 1 -> 0 transition", () => {
    const qc = client();
    const spy = vi.spyOn(qc, "invalidateQueries");

    const { rerender } = renderHook(
      ({ activeCount }: { activeCount: number }) => useRefreshOnRunsSettled("pr1", activeCount),
      { wrapper: wrapper(qc), initialProps: { activeCount: 1 } },
    );
    rerender({ activeCount: 0 });

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["reviews", "pr1"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["pr-runs", "pr1"] });
  });

  it("does not invalidate when prId is null", () => {
    const qc = client();
    const spy = vi.spyOn(qc, "invalidateQueries");

    const { rerender } = renderHook(
      ({ activeCount }: { activeCount: number }) => useRefreshOnRunsSettled(null, activeCount),
      { wrapper: wrapper(qc), initialProps: { activeCount: 1 } },
    );
    rerender({ activeCount: 0 });

    expect(spy).not.toHaveBeenCalled();
  });
});
