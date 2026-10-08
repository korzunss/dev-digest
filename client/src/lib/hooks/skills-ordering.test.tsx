import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentContext, AgentSkillLink, SkillContext } from "@devdigest/shared";

/**
 * Reordering is driven by repeated keypresses, and each press recomputes from
 * the list in the cache. If the cache only learned the new order once the
 * request came back, the second press would read the pre-first order and be
 * lost. These cover the two mutations that carry an order.
 */

const post = vi.fn();
const put = vi.fn();
const del = vi.fn();
vi.mock("../api", () => ({
  api: {
    post: (...args: unknown[]) => post(...args),
    put: (...args: unknown[]) => put(...args),
    get: vi.fn(),
    del: (...args: unknown[]) => del(...args),
  },
  ApiError: class extends Error {},
}));

import { useSetAgentSkills, useSetSkillContext } from "./skills";
import { useSetAgentContext } from "./agents";
import { useResetContextRoots, useSetContextRoots } from "./context";

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
  del.mockReset();
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
  it("writes the new order to the cache before the request resolves, keeping the used-by count", async () => {
    const qc = client();
    qc.setQueryData(["skill-context", "sk1"], {
      links: [
        { skill_id: "sk1", path: "specs/a.md", order: 0 },
        { skill_id: "sk1", path: "docs/b.md", order: 1 },
      ],
      used_by_agents: 3,
    } satisfies SkillContext);
    put.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSetSkillContext(), { wrapper: wrapper(qc) });
    act(() => result.current.mutate({ id: "sk1", paths: ["docs/b.md", "specs/a.md"] }));

    await waitFor(() =>
      expect(
        qc.getQueryData<SkillContext>(["skill-context", "sk1"])!.links.map((l) => l.path),
      ).toEqual(["docs/b.md", "specs/a.md"]),
    );
    expect(qc.getQueryData<SkillContext>(["skill-context", "sk1"])!.used_by_agents).toBe(3);
  });

  it("puts the previous attachment back when the request fails", async () => {
    const qc = client();
    const original: SkillContext = {
      links: [{ skill_id: "sk1", path: "specs/a.md", order: 0 }],
      used_by_agents: 1,
    };
    qc.setQueryData(["skill-context", "sk1"], original);
    put.mockRejectedValue(new Error("422"));

    const { result } = renderHook(() => useSetSkillContext(), { wrapper: wrapper(qc) });
    act(() => result.current.mutate({ id: "sk1", paths: [] }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<SkillContext>(["skill-context", "sk1"])).toEqual(original);
  });
});

describe("useSetAgentContext", () => {
  const inherited = [{ path: "docs/x.md", skill_id: "s1", skill_name: "rubric" }];

  it("writes the new order before the request resolves, keeping the inherited list", async () => {
    const qc = client();
    qc.setQueryData(["agent-context", "ag1"], {
      links: [
        { agent_id: "ag1", path: "specs/a.md", order: 0 },
        { agent_id: "ag1", path: "docs/b.md", order: 1 },
      ],
      inherited,
    } satisfies AgentContext);
    put.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSetAgentContext(), { wrapper: wrapper(qc) });
    act(() => result.current.mutate({ id: "ag1", paths: ["docs/b.md", "specs/a.md"] }));

    await waitFor(() =>
      expect(
        qc.getQueryData<AgentContext>(["agent-context", "ag1"])!.links.map((l) => l.path),
      ).toEqual(["docs/b.md", "specs/a.md"]),
    );
    expect(qc.getQueryData<AgentContext>(["agent-context", "ag1"])!.inherited).toEqual(inherited);
  });

  it("restores the previous links when the request fails", async () => {
    const qc = client();
    const original: AgentContext = {
      links: [{ agent_id: "ag1", path: "specs/a.md", order: 0 }],
      inherited: [],
    };
    qc.setQueryData(["agent-context", "ag1"], original);
    put.mockRejectedValue(new Error("422"));

    const { result } = renderHook(() => useSetAgentContext(), { wrapper: wrapper(qc) });
    act(() => result.current.mutate({ id: "ag1", paths: [] }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData<AgentContext>(["agent-context", "ag1"])).toEqual(original);
  });
});

describe("context roots mutations", () => {
  it("saving and resetting both refresh the listing and store the roots", async () => {
    const qc = client();
    const spy = vi.spyOn(qc, "invalidateQueries");
    put.mockResolvedValue({ globs: ["docs/**/*.md"], is_default: false });
    del.mockResolvedValue({ globs: ["**/{specs,docs,insights}/**/*.md"], is_default: true });

    const set = renderHook(() => useSetContextRoots(), { wrapper: wrapper(qc) });
    act(() => set.result.current.mutate({ repoId: "r1", globs: ["docs/**/*.md"] }));
    await waitFor(() => expect(set.result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(["context-roots", "r1"])).toEqual({ globs: ["docs/**/*.md"], is_default: false });

    const reset = renderHook(() => useResetContextRoots(), { wrapper: wrapper(qc) });
    act(() => reset.result.current.mutate({ repoId: "r1" }));
    await waitFor(() => expect(reset.result.current.isSuccess).toBe(true));
    expect(del).toHaveBeenCalledWith("/repos/r1/context/roots");
    expect(qc.getQueryData<{ is_default: boolean }>(["context-roots", "r1"])!.is_default).toBe(true);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["context-docs", "r1"] });
  });
});
