import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentVersion, AgentVersionDiff } from "@devdigest/shared";
import agentMessages from "../../../../../../../../messages/en/agents.json";
import commonMessages from "../../../../../../../../messages/en/common.json";
import { ToastProvider } from "../../../../../../../lib/toast";
import { ApiError } from "../../../../../../../lib/api";
import { formatFieldValue, shortId } from "./helpers";

const useAgentVersions = vi.fn();
const useAgentVersionDiff = vi.fn();
const useProviderModels = vi.fn();
const useSecretsStatus = vi.fn();
const restoreMutate = vi.fn();
let restorePending = false;
const refetch = vi.fn();
const diffRefetch = vi.fn();

vi.mock("../../../../../../../lib/hooks/agents", async (importActual) => ({
  ...(await importActual<typeof import("../../../../../../../lib/hooks/agents")>()),
  useAgentVersions: (id: string) => useAgentVersions(id),
  useAgentVersionDiff: (id: string, v: number | null) => useAgentVersionDiff(id, v),
  useProviderModels: (p: string | null) => useProviderModels(p),
  useRestoreAgentVersion: () => ({ mutate: restoreMutate, isPending: restorePending }),
}));
vi.mock("../../../../../../../lib/hooks/core", async (importActual) => ({
  ...(await importActual<typeof import("../../../../../../../lib/hooks/core")>()),
  useSecretsStatus: () => useSecretsStatus(),
}));

import { VersionsTab } from "./VersionsTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "x",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 3,
};

const CONFIG = {
  provider: "openai" as const,
  model: "gpt-4.1",
  system_prompt: "old",
  output_schema: null,
  strategy: "single-pass" as const,
  ci_fail_on: "critical" as const,
  repo_intel: true,
  skills: ["sk1"],
};

const v = (version: number, message: string | null, config: AgentVersion["config"] = CONFIG): AgentVersion => ({
  agent_id: "ag1",
  version,
  config,
  message,
  created_at: "2026-05-30T10:00:00.000Z",
});

const HISTORY = [v(3, "<b>x</b> tightened"), v(2, "Changed model"), v(1, null)];

const DIFF: AgentVersionDiff = {
  from: 2,
  to: 3,
  config_available: true,
  prompt_patch: "--- a\n+++ b\n@@ -1 +1 @@\n-old prompt line\n+new prompt line\n",
  fields: [{ field: "model", from: "gpt-4.1", to: "gpt-5" }],
  skills: {
    from: [
      { id: "sk1", name: "alpha-rule", deleted: false },
      { id: "abcdef1234567890", name: null, deleted: true },
    ],
    to: [{ id: "sk9", name: "gamma-rule", deleted: false }],
    added: [{ id: "sk9", name: "gamma-rule", deleted: false }],
    removed: [{ id: "abcdef1234567890", name: null, deleted: true }],
    order_changed: true,
  },
  identical: false,
};

const list = (data: AgentVersion[] | undefined, over: Record<string, unknown> = {}) =>
  useAgentVersions.mockReturnValue({ data, isLoading: false, isError: false, error: null, refetch, ...over });
const diffState = (over: Record<string, unknown> = {}) =>
  useAgentVersionDiff.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: diffRefetch, ...over });

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: agentMessages, common: commonMessages }}>
      <ToastProvider>
        <VersionsTab agent={AGENT} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

function setup(versions: AgentVersion[] = HISTORY) {
  list(versions);
  diffState();
  useSecretsStatus.mockReturnValue({ data: { openai: true, anthropic: true, openrouter: true, github: true, gitlab: true } });
  useProviderModels.mockReturnValue({ data: [{ id: "gpt-4.1", provider: "openai" }] });
}

afterEach(() => {
  cleanup();
  [useAgentVersions, useAgentVersionDiff, useProviderModels, useSecretsStatus, restoreMutate, refetch, diffRefetch].forEach((f) => f.mockReset());
  restorePending = false;
});

describe("helpers", () => {
  it("shortens ids and formats values", () => {
    expect(shortId("abcdef1234567890")).toBe("abcdef12");
    expect(formatFieldValue(null)).toBe("—");
    expect(formatFieldValue(false)).toBe("false");
  });
});

describe("VersionsTab list", () => {
  it("lists newest first, marks the current one, and renders a message as literal text", () => {
    setup();
    renderTab();
    expect(screen.getByText("<b>x</b> tightened")).toBeInTheDocument();
    expect(screen.getByText(agentMessages.versions.noMessage)).toBeInTheDocument();
    expect(screen.getByText(agentMessages.versions.current)).toBeInTheDocument();
    const badges = screen.getAllByText(/^v\d$/).map((n) => n.textContent);
    expect(badges).toEqual(["v3", "v2", "v1"]);
    expect(screen.getAllByText(agentMessages.versions.diff)).toHaveLength(2);
    expect(screen.getAllByText(agentMessages.versions.restore)).toHaveLength(2);
  });

  it("shows nothing but a skeleton while loading", () => {
    list(undefined, { isLoading: true });
    renderTab();
    expect(screen.queryByText(agentMessages.versions.title)).not.toBeInTheDocument();
  });

  it("offers a retry when the history fails to load", () => {
    list(undefined, { isError: true, error: new Error("boom") });
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("says the agent is gone on a 404, without a retry", () => {
    list(undefined, { isError: true, error: new ApiError("nope", 404) });
    renderTab();
    expect(screen.getByText(agentMessages.versions.agentGone)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry|try again/i })).not.toBeInTheDocument();
  });

  it("explains the only-one state", () => {
    setup([v(3, null)]);
    renderTab();
    expect(screen.getByText(agentMessages.versions.onlyOne)).toBeInTheDocument();
    expect(agentMessages.versions.onlyOne).toMatch(/diff and restore become available after the next change/i);
  });

  it("flags a version whose stored config cannot be read", () => {
    setup([v(3, null), v(2, "bad", null)]);
    renderTab();
    expect(screen.getByText(agentMessages.versions.configUnavailable)).toBeInTheDocument();
  });

  it("disables every Restore while one is pending", () => {
    setup();
    restorePending = true;
    renderTab();
    for (const b of screen.getAllByText(agentMessages.versions.restoring)) {
      expect(b.closest("button")).toBeDisabled();
    }
  });
});

describe("VersionsTab diff", () => {
  it("fetches nothing until Diff is pressed, then shows prompt, fields and skills", () => {
    setup();
    renderTab();
    expect(useAgentVersionDiff).not.toHaveBeenCalled();
    diffState({ data: DIFF });
    fireEvent.click(screen.getAllByText(agentMessages.versions.diff)[0]!);
    expect(useAgentVersionDiff).toHaveBeenLastCalledWith("ag1", 2);
    expect(screen.getByText("v2 → v3")).toBeInTheDocument();
    expect(screen.getByText(/new prompt line/)).toBeInTheDocument();
    expect(screen.getByText(agentMessages.versions.field.model)).toBeInTheDocument();
    expect(screen.getByText("gpt-5")).toBeInTheDocument();
    expect(screen.getAllByText("gamma-rule")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Deleted skill · abcdef12").length).toBeGreaterThan(0);
    // SP-AC-10: the changed order names the skills, old order -> new order.
    const order = screen.getByText(/Skill order changed/);
    expect(order).toHaveTextContent("Skill order changed: alpha-rule, Deleted skill · abcdef12 → gamma-rule");
  });

  it("labels an unknown diff field with its raw name instead of a missing message", () => {
    setup();
    renderTab();
    diffState({ data: { ...DIFF, fields: [{ field: "temperature", from: "1", to: "2" }] } });
    fireEvent.click(screen.getAllByText(agentMessages.versions.diff)[0]!);
    expect(screen.getByText("temperature")).toBeInTheDocument();
  });

  it("says so when the version is identical, and offers a retry on error", () => {
    setup();
    renderTab();
    diffState({ data: { ...DIFF, prompt_patch: "", fields: [], skills: { ...DIFF.skills, added: [], removed: [], order_changed: false }, identical: true } });
    fireEvent.click(screen.getAllByText(agentMessages.versions.diff)[0]!);
    expect(screen.getByText(agentMessages.versions.identical)).toBeInTheDocument();
    cleanup();

    setup();
    renderTab();
    diffState({ isError: true });
    fireEvent.click(screen.getAllByText(agentMessages.versions.diff)[0]!);
    fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(diffRefetch).toHaveBeenCalledTimes(1);
  });
});

describe("VersionsTab restore", () => {
  const openRestore = () => fireEvent.click(screen.getAllByText(agentMessages.versions.restore)[0]!);

  it("lists the skills that will be attached, flags dropped ones, and restores on confirm", () => {
    setup();
    renderTab();
    diffState({ data: DIFF });
    openRestore();
    expect(screen.getByText("Restore v2?")).toBeInTheDocument();
    expect(screen.getByText("alpha-rule")).toBeInTheDocument();
    const warn = screen.getByText(agentMessages.versions.restoreMissing).parentElement!;
    // SP-AC-16: the dropped skill is named, not just counted.
    expect(within(warn).getByText("Deleted skill · abcdef12")).toBeInTheDocument();
    expect(restoreMutate).not.toHaveBeenCalled();

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: agentMessages.versions.restoreConfirm }));
    expect(restoreMutate.mock.calls[0]![0]).toEqual({ id: "ag1", version: 2 });
  });

  it("warns about a missing key, and about an unknown model only when the key exists", () => {
    setup([v(3, null), v(2, null, { ...CONFIG, provider: "anthropic" })]);
    useSecretsStatus.mockReturnValue({ data: { openai: true, anthropic: false, openrouter: true, github: true, gitlab: true } });
    renderTab();
    diffState({ data: DIFF });
    openRestore();
    expect(screen.getByText("No API key is set for anthropic; reviews will fail until you add one.")).toBeInTheDocument();
    expect(useProviderModels).toHaveBeenLastCalledWith(null);
    cleanup();

    setup([v(3, null), v(2, null, { ...CONFIG, model: "gpt-retired" })]);
    renderTab();
    diffState({ data: DIFF });
    openRestore();
    expect(screen.getByText("The model gpt-retired is not in the provider's current model list.")).toBeInTheDocument();
  });

  it("does not claim 'no skills' when the diff failed: warns, retries, keeps Restore disabled", () => {
    setup();
    renderTab();
    diffState({ isError: true });
    openRestore();
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(agentMessages.versions.restoreDiffError)).toBeInTheDocument();
    expect(dialog.queryByText(agentMessages.versions.restoreNoSkills)).not.toBeInTheDocument();
    expect(dialog.getByRole("button", { name: agentMessages.versions.restoreConfirm })).toBeDisabled();
    fireEvent.click(dialog.getByRole("button", { name: commonMessages.actions.retry }));
    expect(diffRefetch).toHaveBeenCalledTimes(1);
  });

  it("raises no per-call error toast on a failed restore (the global handler owns it)", () => {
    setup();
    renderTab();
    diffState({ data: DIFF });
    openRestore();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: agentMessages.versions.restoreConfirm }));
    expect(restoreMutate.mock.calls[0]![1]).not.toHaveProperty("onError");
  });

  it("renders the modals in document.body, outside the editor container", () => {
    setup();
    const { container } = renderTab();
    diffState({ data: DIFF });
    openRestore();
    expect(container).not.toContainElement(screen.getByRole("dialog"));
  });

  it("disables confirm when the stored config is malformed", () => {
    setup([v(3, null), v(2, "bad", null)]);
    renderTab();
    openRestore();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: agentMessages.versions.restoreConfirm })).toBeDisabled();
  });
});
