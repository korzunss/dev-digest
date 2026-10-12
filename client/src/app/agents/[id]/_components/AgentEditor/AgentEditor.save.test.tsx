import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import commonMessages from "../../../../../../messages/en/common.json";
import { ToastProvider } from "../../../../../lib/toast";

const put = vi.fn();
vi.mock("../../../../../lib/api", async (importActual) => {
  const actual = await importActual<typeof import("../../../../../lib/api")>();
  return { ...actual, api: { ...actual.api, put: (...a: unknown[]) => put(...a), get: async () => [] } };
});

import { AgentEditor } from "./AgentEditor";
import { useAgent } from "../../../../../lib/hooks/agents";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
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

// Mirrors the page: the agent comes from the ["agent", id] cache, which a save updates.
function Harness() {
  const { data } = useAgent("ag1");
  return data ? <AgentEditor agent={data} tab="config" onTab={() => {}} /> : null;
}

afterEach(() => {
  cleanup();
  put.mockReset();
});

describe("ConfigTab save with a real query client", () => {
  it("still shows the success toast after the save bumps the version and remounts the tab", async () => {
    put.mockResolvedValue({ ...AGENT, name: "Renamed", version: 2 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["agent", "ag1"], AGENT);
    render(
      <QueryClientProvider client={qc}>
        <NextIntlClientProvider locale="en" messages={{ agents: messages, common: commonMessages }}>
          <ToastProvider>
            <Harness />
          </ToastProvider>
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: messages.config.save }));
    await waitFor(() => expect(screen.getByDisplayValue("Renamed")).toBeInTheDocument());
    expect(await screen.findByText("Agent saved (v2)")).toBeInTheDocument();
    // Proof the tab really remounted: its own mutation state (the inline "Saved" note) is gone.
    expect(screen.queryByText(/^Saved \(v/)).not.toBeInTheDocument();
  });
});
