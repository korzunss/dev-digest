import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import skillMessages from "../../../../../../messages/en/skills.json";
import commonMessages from "../../../../../../messages/en/common.json";
import { ToastProvider } from "../../../../../lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../../lib/hooks/agents", async (importActual) => ({
  ...(await importActual<typeof import("../../../../../lib/hooks/agents")>()),
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
  useAgentVersions: () => ({
    data: [
      { agent_id: "ag1", version: 2, config: null, message: "Tuned the prompt", created_at: "2026-05-30T10:00:00.000Z" },
      { agent_id: "ag1", version: 1, config: null, message: null, created_at: "2026-05-29T10:00:00.000Z" },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAgentVersionDiff: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreAgentVersion: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../../../../../lib/hooks/skills", async (importActual) => ({
  ...(await importActual<typeof import("../../../../../lib/hooks/skills")>()),
  useSkills: () => ({
    data: [{ id: "sk1", name: "alpha-rule", description: "", type: "custom", source: "manual", body: "", enabled: true, version: 1, evidence_files: null }],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAgentSkills: () => ({ data: [] }),
  useSetAgentSkills: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages, skills: skillMessages, common: commonMessages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("offers a Context tab next to Skills", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Context")).toBeInTheDocument();
  });

  it("offers an Evals tab after Context", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels.indexOf("Evals")).toBe(labels.indexOf("Context") + 1);
  });

  it("opens the Evals tab on click", () => {
    const onTab = vi.fn();
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={onTab} />);
    fireEvent.click(screen.getByRole("button", { name: "Evals" }));
    expect(onTab).toHaveBeenCalledWith("evals");
  });

  it("offers a Versions tab last and renders its history on tab=versions", () => {
    renderWithIntl(<AgentEditor agent={{ ...AGENT, version: 2 }} tab="versions" onTab={() => {}} />);
    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    // Stats sits right after Evals (plan 42, TQ1); Versions follows it.
    expect(labels.indexOf("Stats")).toBe(labels.indexOf("Evals") + 1);
    expect(labels.indexOf("Versions")).toBe(labels.indexOf("Stats") + 1);
    expect(screen.getByText("Tuned the prompt")).toBeInTheDocument();
    expect(screen.getByText(messages.versions.current)).toBeInTheDocument();
  });

  it("reports staged Skills edits as dirty, so the page can ask before leaving", () => {
    const onSkillsDirtyChange = vi.fn();
    renderWithIntl(
      <AgentEditor agent={AGENT} tab="skills" onTab={() => {}} onSkillsDirtyChange={onSkillsDirtyChange} />,
    );
    expect(onSkillsDirtyChange).not.toHaveBeenCalledWith(true);
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(onSkillsDirtyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByText(messages.skills.unsaved)).toBeInTheDocument();
  });
});
