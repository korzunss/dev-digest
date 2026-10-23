/* A single-case edit answers a plain EvalSuiteCase (no `outside_applies_to`), so the
   skill case list — the only source of that flag — must be refetched. */
import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const get = vi.fn();
const put = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p), put: (p: string, b?: unknown) => put(p, b), post: vi.fn(), del: vi.fn() },
}));

import { useSkillEvalCases, useUpdateEvalCase } from "./eval";

afterEach(() => {
  get.mockReset();
  put.mockReset();
});

describe("skill eval case hooks", () => {
  // Editing a skill case refetches /skills/:id/eval-cases so outside_applies_to is recomputed.
  it("refetches the skill case list after a single-case edit", async () => {
    let calls = 0;
    get.mockImplementation(async () => {
      calls++;
      return [{ id: "c1", outside_applies_to: calls > 1 }];
    });
    put.mockResolvedValue({ id: "c1" });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const list = renderHook(() => useSkillEvalCases("s1"), { wrapper });
    await waitFor(() => expect(list.result.current.data).toEqual([{ id: "c1", outside_applies_to: false }]));
    const update = renderHook(() => useUpdateEvalCase(), { wrapper });

    await act(async () => {
      await update.result.current.mutateAsync({
        id: "c1",
        owner: { kind: "skill", skillId: "s1" },
        body: {} as never,
      });
    });

    await waitFor(() => expect(list.result.current.data).toEqual([{ id: "c1", outside_applies_to: true }]));
  });
});
