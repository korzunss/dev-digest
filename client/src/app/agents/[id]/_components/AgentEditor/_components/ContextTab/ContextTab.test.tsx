/* Agent ContextTab — the agent-specific half: the mutation a change calls and
   the inherited documents. The list itself is covered by ContextDocPicker's
   own test. No `@testing-library/user-event` here. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentContext, SpecFile } from "@devdigest/shared";
import agentMessages from "../../../../../../../../messages/en/agents.json";
import contextMessages from "../../../../../../../../messages/en/context.json";

const setContextMutate = vi.fn();
const useAgentContext = vi.fn();
const useContextDocs = vi.fn();
let activeRepoId: string | null = "repo-1";
let saveFailed = false;

vi.mock("@/lib/hooks/agents", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/hooks/agents")>()),
  useAgentContext: (id: string) => useAgentContext(id),
  useSetAgentContext: () => ({ mutate: setContextMutate, isPending: false, isError: saveFailed }),
}));
vi.mock("@/lib/hooks/context", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/hooks/context")>()),
  useContextDocs: (repoId: string) => useContextDocs(repoId),
  useContextDoc: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: activeRepoId, activeRepo: null, repos: [], reposLoaded: true }),
}));

import { ContextTab } from "./ContextTab";

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

const doc = (path: string): SpecFile => ({ path, content: null, size: 120, updated_at: null, type: "specs", tokens: 10 });
const DOCS = [doc("specs/public-api.md"), doc("specs/rate-limiting.md"), doc("docs/architecture.md")];

const ctx = (paths: string[]): AgentContext => ({
  links: paths.map((path, order) => ({ agent_id: "ag1", path, order })),
  inherited: [{ path: "docs/architecture.md", skill_id: "sk1", skill_name: "pr-quality-rubric" }],
});

function renderTab(context: AgentContext = ctx([])) {
  useContextDocs.mockReturnValue({ data: { docs: DOCS, truncated: false }, isLoading: false, isError: false, refetch: vi.fn() });
  useAgentContext.mockReturnValue({ data: context, isLoading: false, isError: false, refetch: vi.fn() });
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentMessages, context: contextMessages }}>
      <ContextTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  activeRepoId = "repo-1";
  saveFailed = false;
  setContextMutate.mockReset();
  useAgentContext.mockReset();
  useContextDocs.mockReset();
});

describe("agent ContextTab", () => {
  it("sends the whole ordered path list when a document is checked, and shows inherited ones as read-only", () => {
    renderTab(ctx(["specs/public-api.md"]));

    expect(screen.getByText("via pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "docs/architecture.md" })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: "specs/rate-limiting.md" }));
    expect(setContextMutate).toHaveBeenCalledWith({
      id: "ag1",
      paths: ["specs/public-api.md", "specs/rate-limiting.md"],
    });
  });

  it("shows the undone-change alert only after a save failed", () => {
    renderTab();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    cleanup();
    saveFailed = true;
    renderTab();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save the attached documents. Your change was undone.");
  });

  it("asks for a repository instead of listing documents when none is selected", () => {
    activeRepoId = null;
    renderTab();
    expect(screen.getByText("Select a repository")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("offers no checkboxes while the stored links load, and a retry when they fail", () => {
    renderTab();
    useAgentContext.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    cleanup();
    render(
      <NextIntlClientProvider locale="en" messages={{ agents: agentMessages, context: contextMessages }}>
        <ContextTab agent={AGENT} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    cleanup();
    useAgentContext.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    render(
      <NextIntlClientProvider locale="en" messages={{ agents: agentMessages, context: contextMessages }}>
        <ContextTab agent={AGENT} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Could not load this agent's context documents.")).toBeInTheDocument();
  });
});
