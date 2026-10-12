import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const mutate = vi.fn();
vi.mock("../../../../../../../lib/hooks/agents", async (importActual) => ({
  ...(await importActual<typeof import("../../../../../../../lib/hooks/agents")>()),
  useUpdateAgent: () => ({ mutate, isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

import { ConfigTab } from "./ConfigTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 3,
};

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

const tree = (agent: Agent) => (
  <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
    <ToastProvider>
      <ConfigTab agent={agent} />
    </ToastProvider>
  </NextIntlClientProvider>
);

function renderTab(agent: Agent = AGENT) {
  return render(tree(agent));
}

describe("ConfigTab version note", () => {
  it("offers no note for a name-only edit and sends none", () => {
    renderTab();
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), {
      target: { value: "Renamed" },
    });
    expect(screen.queryByText(messages.config.note)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: messages.config.save }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0].message).toBeUndefined();
  });

  it("offers a note when the prompt changes and sends it as `message`", () => {
    renderTab();
    fireEvent.change(screen.getByDisplayValue(AGENT.system_prompt), {
      target: { value: "Be stricter." },
    });
    const note = screen.getByLabelText(messages.config.note);
    fireEvent.change(note, { target: { value: "  tighten prompt " } });

    fireEvent.click(screen.getByRole("button", { name: messages.config.save }));
    expect(mutate.mock.calls[0]![0]).toMatchObject({
      id: "ag1",
      patch: { system_prompt: "Be stricter." },
      message: "tighten prompt",
    });
  });

  it("blocks Save for a note over the limit and keeps the edits", () => {
    renderTab();
    fireEvent.change(screen.getByDisplayValue(AGENT.system_prompt), {
      target: { value: "Be stricter." },
    });
    fireEvent.change(screen.getByLabelText(messages.config.note), {
      target: { value: "x".repeat(501) },
    });

    expect(screen.getByRole("alert")).toHaveTextContent("max 500");
    expect(screen.getByRole("button", { name: messages.config.save })).toBeDisabled();
    expect(screen.getByDisplayValue("Be stricter.")).toBeInTheDocument();
  });
});

describe("ConfigTab enabled flag", () => {
  it("never sends `enabled` on Save, so a toggle made elsewhere is not reverted", () => {
    const { rerender } = renderTab();
    fireEvent.change(screen.getByDisplayValue("Security Reviewer"), { target: { value: "Renamed" } });
    // The AgentCard toggle flips `enabled` without bumping the version.
    rerender(tree({ ...AGENT, enabled: false }));

    fireEvent.click(screen.getByRole("button", { name: messages.config.save }));
    expect(mutate.mock.calls[0]![0].patch).not.toHaveProperty("enabled");
    expect(mutate.mock.calls[0]![0].patch).toMatchObject({ name: "Renamed" });
  });

  it("writes the toggle straight away from the stored value", () => {
    renderTab();
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    expect(mutate).toHaveBeenCalledWith({ id: "ag1", patch: { enabled: false } });
  });

  it("measures the note after trimming", () => {
    renderTab();
    fireEvent.change(screen.getByDisplayValue(AGENT.system_prompt), { target: { value: "Be stricter." } });
    fireEvent.change(screen.getByLabelText(messages.config.note), {
      target: { value: `${"x".repeat(500)}   ` },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.config.save })).toBeEnabled();
  });
});
