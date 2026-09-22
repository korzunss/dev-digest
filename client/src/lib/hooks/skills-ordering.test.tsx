import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentSkillLink, SkillContextLink } from "@devdigest/shared";

/**
 * Reordering is driven by repeated keypresses, and each press recomputes from
 * the list in the cache. If the cache only learned the new order once the
 * request came back, the second press would read the pre-first order and be
 * lost. These cover the two mutations that carry an order.
 */

const post = vi.fn();
const put = vi.fn();
vi.mock("../api", () => ({
  api: {
    post: (...args: unknown[]) => post(...args),
    put: (...args: unknown[]) => put(...args),
    get: vi.fn(),
    del: vi.fn(),
  },
  ApiError: class extends Error {},
}));

import { useSetAgentSkills, useSetSkillContext } from "./skills";

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

const link = (skill_id: string, order: number): AgentSkillLink => ({
  agent_id: "ag1",
  skill_id,
  order,
});

afterEach(() => {
  cleanup();
  post.mockReset();
  put.mockReset();
});

describe("useSetAgentSkills", () => {
  it("writes the new order to the cache before the request resolves", async () => {
    const qc = client();
    qc.setQueryData(["agent-skills", "ag1"], [link("a", 0), link("b", 1), link("c", 2)]);
    // Never resolves during the assertion: the point is what the cache holds
    // while the request is still in flight.
    post.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSetAgentSkills(), { wrapper: wrapper(qc) });
    act(() => result.current.mutate({ agentId: "ag1", skillIds: ["c", "a", "b"] }));

    await waitFor(() =>
      expect(
        qc.getQueryData<AgentSkillLink[]>(["agent-skills", "ag1"])!.map((l) => l.skill_id),
      ).toEqual(["c", "a", "b"]),
    );
  });

  it("renumbers order so a second move reads positions, not just ids", async () => {
    const qc = client();
    qc.setQueryData(["agent-skills", "ag1"], [link("a", 0), link("b", 1)]);
    post.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSetAgentSkills(), { wrapper: wrapper(qc) });
    act(() => result.current.mutate({ agentId: "ag1", skillIds: ["b", "a"] }));

    await waitFor(() =>
      expect(qc.getQueryData<AgentSkillLink[]>(["agent-skills", "ag1"])).toEqual([
        { agent_id: "ag1", skill_id: "b", order: 0 },
        { agent_id: "ag1", skill_id: "a", order: 1 },
      ]),
    );
  });

  it("puts the server's order back when the request fails", async () => {
    const qc = client();
    const original = [link("a", 0), link("b", 1)];
    qc.setQueryData(["agent-skills", "ag1"], original);
    post.mockRejectedValue(new Error("500"));

    const { result } = renderHook(() => useSetAgentSkills(), { wrapper: wrapper(qc) });
    act(() => result.current.mutate({ agentId: "ag1", skillIds: ["b", "a"] }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<AgentSkillLink[]>(["agent-skills", "ag1"])).toEqual(original);
  });

  it("takes the server's answer as final once it arrives", async () => {
    const qc = client();
    qc.setQueryData(["agent-skills", "ag1"], [link("a", 0), link("b", 1)]);
    // The server is the authority: it may drop an id it no longer knows.
    post.mockResolvedValue([link("b", 0)]);

    const { result } = renderHook(() => useSetAgentSkills(), { wrapper: wrapper(qc) });
    act(() => result.current.mutate({ agentId: "ag1", skillIds: ["b", "a"] }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(
      qc.getQueryData<AgentSkillLink[]>(["agent-skills", "ag1"])!.map((l) => l.skill_id),
    ).toEqual(["b"]);
  });
});

describe("useSetSkillContext", () => {
  it("writes the new order to the cache before the request resolves", async () => {
    const qc = client();
    qc.setQueryData(["skill-context", "sk1"], [
      { skill_id: "sk1", path: "specs/a.md", order: 0 },
      { skill_id: "sk1", path: "docs/b.md", order: 1 },
    ] satisfies SkillContextLink[]);
    put.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSetSkillContext(), { wrapper: wrapper(qc) });
    act(() => result.current.mutate({ id: "sk1", paths: ["docs/b.md", "specs/a.md"] }));

    await waitFor(() =>
      expect(
        qc.getQueryData<SkillContextLink[]>(["skill-context", "sk1"])!.map((l) => l.path),
      ).toEqual(["docs/b.md", "specs/a.md"]),
    );
  });

  it("puts the previous attachment back when the request fails", async () => {
    const qc = client();
    const original: SkillContextLink[] = [{ skill_id: "sk1", path: "specs/a.md", order: 0 }];
    qc.setQueryData(["skill-context", "sk1"], original);
    put.mockRejectedValue(new Error("422"));

    const { result } = renderHook(() => useSetSkillContext(), { wrapper: wrapper(qc) });
    act(() => result.current.mutate({ id: "sk1", paths: [] }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<SkillContextLink[]>(["skill-context", "sk1"])).toEqual(original);
  });
});
