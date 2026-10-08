import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentContext, SkillContext } from "@devdigest/shared";

/**
 * Saving an attachment list changes "used by N agents" only on the documents
 * that were added or removed, so only their `["context-doc", repo, path]`
 * queries may go stale — not every preview, and not the skill's own context.
 */

const put = vi.fn();
vi.mock("../api", () => ({
  api: { put: (...args: unknown[]) => put(...args), get: vi.fn(), post: vi.fn(), del: vi.fn() },
  ApiError: class extends Error {},
}));

import { useSetAgentContext } from "./agents";
import { useSetSkillContext } from "./skills";
import { changedPaths } from "./context";

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

const agentCtx = (paths: string[]): AgentContext => ({
  links: paths.map((path, order) => ({ agent_id: "ag1", path, order })),
  inherited: [],
});
const skillCtx = (paths: string[]): SkillContext => ({
  links: paths.map((path, order) => ({ skill_id: "sk1", path, order })),
  used_by_agents: 0,
});

/** Seed the doc + skill-context queries and report which ones are invalidated. */
function seed(qc: QueryClient) {
  for (const p of ["a.md", "b.md"]) qc.setQueryData(["context-doc", "r1", p], { path: p });
  qc.setQueryData(["skill-context", "sk1"], skillCtx([]));
  const stale = (key: unknown[]) => qc.getQueryState(key)!.isInvalidated;
  return stale;
}

afterEach(() => {
  cleanup();
  put.mockReset();
});

describe("changedPaths", () => {
  it("is the symmetric difference, empty for a reorder, null when the past is unknown", () => {
    expect(changedPaths(["a", "b"], ["b", "c"])!.sort()).toEqual(["a", "c"]);
    expect(changedPaths(["a", "b"], ["b", "a"])).toEqual([]);
    expect(changedPaths(undefined, ["a"])).toBeNull();
  });
});

describe("context-doc invalidation", () => {
  it("an agent save invalidates only the added path, a reorder nothing, and never skill-context", async () => {
    const { qc, wrapper } = setup();
    qc.setQueryData(["agent-context", "ag1"], agentCtx(["a.md"]));
    const stale = seed(qc);
    const { result } = renderHook(() => useSetAgentContext(), { wrapper });

    put.mockResolvedValueOnce(agentCtx(["a.md", "b.md"]));
    await act(() => result.current.mutateAsync({ id: "ag1", paths: ["a.md", "b.md"] }));
    await waitFor(() => expect(stale(["context-doc", "r1", "b.md"])).toBe(true));
    expect(stale(["context-doc", "r1", "a.md"])).toBe(false);
    expect(stale(["skill-context", "sk1"])).toBe(false);

    // Reorder only: nothing new goes stale.
    qc.setQueryData(["context-doc", "r1", "b.md"], { path: "b.md" });
    put.mockResolvedValueOnce(agentCtx(["b.md", "a.md"]));
    await act(() => result.current.mutateAsync({ id: "ag1", paths: ["b.md", "a.md"] }));
    expect(stale(["context-doc", "r1", "a.md"])).toBe(false);
    expect(stale(["context-doc", "r1", "b.md"])).toBe(false);
  });

  it("a skill save invalidates the changed path", async () => {
    const { qc, wrapper } = setup();
    qc.setQueryData(["skill-context", "sk1"], skillCtx(["a.md"]));
    const stale = seed(qc);
    qc.setQueryData(["skill-context", "sk1"], skillCtx(["a.md"]));
    const { result } = renderHook(() => useSetSkillContext(), { wrapper });

    put.mockResolvedValueOnce(skillCtx(["a.md", "b.md"]));
    await act(() => result.current.mutateAsync({ id: "sk1", paths: ["a.md", "b.md"] }));
    await waitFor(() => expect(stale(["context-doc", "r1", "b.md"])).toBe(true));
    expect(stale(["context-doc", "r1", "a.md"])).toBe(false);
  });
});
