/* The unsaved-Skills guard lives on the page: it owns the tab and the agent
   list, so a tab switch or another agent card is only interceptable here.
   Hooks and the router are stubbed; the shell has its own smoke test. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import agentMessages from "../../../../messages/en/agents.json";
import skillMessages from "../../../../messages/en/skills.json";
import commonMessages from "../../../../messages/en/common.json";
import { ToastProvider } from "../../../lib/toast";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "ag1" }),
  useSearchParams: () => new URLSearchParams("tab=skills"),
  useRouter: () => ({ replace, push }),
}));
vi.mock("../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mk = (id: string, name: string): Agent => ({
  id,
  name,
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "x",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
});
const AGENTS = [mk("ag1", "Security Reviewer"), mk("ag2", "Style Reviewer")];

vi.mock("../../../lib/hooks/agents", async (importActual) => ({
  ...(await importActual<typeof import("../../../lib/hooks/agents")>()),
  useAgents: () => ({ data: AGENTS }),
  useAgent: () => ({ data: AGENTS[0], isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAgent: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../../lib/hooks/skills", async (importActual) => ({
  ...(await importActual<typeof import("../../../lib/hooks/skills")>()),
  useSkills: () => ({
    data: [{ id: "sk1", name: "alpha-rule", description: "", type: "custom", source: "manual", body: "", enabled: true, version: 1, evidence_files: null }],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAgentSkills: () => ({ data: [] }),
  useSetAgentSkills: () => ({ mutate: vi.fn(), isPending: false }),
}));

import AgentEditorPage from "./page";

afterEach(() => {
  cleanup();
  replace.mockReset();
  push.mockReset();
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: agentMessages, skills: skillMessages, common: commonMessages }}>
        <ToastProvider>
          <AgentEditorPage />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("AgentEditorPage unsaved Skills guard", () => {
  it("switches tabs freely while nothing is staged", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Config" }));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(agentMessages.skills.discardTitle)).not.toBeInTheDocument();
  });

  it("asks before a tab switch with staged edits; refusing keeps them, confirming leaves", () => {
    renderPage();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Config" }));
    expect(screen.getByText(agentMessages.skills.discardTitle)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Close"));
    expect(screen.queryByText(agentMessages.skills.discardTitle)).not.toBeInTheDocument();
    expect(screen.getByText(agentMessages.skills.unsaved)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Config" }));
    fireEvent.click(screen.getByText(agentMessages.skills.discardConfirm));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("asks before opening another agent card with staged edits", () => {
    renderPage();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByText("Style Reviewer"));
    expect(screen.getByText(agentMessages.skills.discardTitle)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(agentMessages.skills.discardConfirm));
    expect(push).toHaveBeenCalledWith("/agents/ag2?tab=skills");
  });
});
