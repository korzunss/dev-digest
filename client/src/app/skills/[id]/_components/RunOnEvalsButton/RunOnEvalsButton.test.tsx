/* RunOnEvalsButton — AC-91–AC-93: disabled with a reason for a disabled skill
   or when no agent has cases; otherwise lists the agents and skipped ones,
   starts on confirm, and reports a skill disabled while the dialog was open.
   Hooks are REAL; the network edge (`api`) is stubbed. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalSkillRunAgentsPreview, Skill } from "@devdigest/shared";
import skillsMessages from "../../../../../../messages/en/skills.json";
import evalMessages from "../../../../../../messages/en/eval.json";
import common from "../../../../../../messages/en/common.json";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p), post: (p: string, b?: unknown) => post(p, b) },
}));
const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastInfo = vi.fn();
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: toastSuccess, error: toastError, info: toastInfo, toast: vi.fn() }) }));

import { ApiError } from "@/lib/api";
import { RunOnEvalsButton } from "./RunOnEvalsButton";

const SKILL: Skill = {
  id: "s1", name: "secret-gate", description: "d", type: "security", source: "manual", body: "# b",
  enabled: true, version: 3, evidence_files: null, agent_count: 2, pull_rate: null, accept_rate: null,
};

const PREVIEW: EvalSkillRunAgentsPreview = {
  agents: [{ agent_id: "a1", name: "Security Reviewer", model: "gpt-x", cases: 3 }],
  total_cases: 3,
  skipped: [{ agent_id: "a2", name: "Docs Reviewer", provider: "anthropic", reason: "no_api_key" }],
  blocked: null,
};

function setup(preview: EvalSkillRunAgentsPreview, skill: Skill = SKILL) {
  get.mockResolvedValue(preview);
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages, eval: evalMessages, common }}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RunOnEvalsButton skill={skill} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const runButton = () => screen.getByRole("button", { name: "Run on evals" });

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  toastInfo.mockReset();
});
afterEach(cleanup);

describe("RunOnEvalsButton", () => {
  it("lists the agents and the skipped one, then starts the runs on confirm", async () => {
    post.mockResolvedValue({ started: [{ agent_id: "a1", run_id: "r1" }], skipped: PREVIEW.skipped });
    setup(PREVIEW);
    await waitFor(() => expect(runButton()).toBeEnabled());
    fireEvent.click(runButton());
    expect(await screen.findByText(/Security Reviewer · gpt-x · 3 cases/)).toBeInTheDocument();
    expect(screen.getByText(/Docs Reviewer · skipped: no API key for anthropic/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/skills/s1/eval-run-agents", { confirm: true }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Started 1 run"));
    expect(toastInfo).toHaveBeenCalled();
  });

  it("is disabled with the reason for a disabled skill", async () => {
    setup({ ...PREVIEW, blocked: "skill_disabled" }, { ...SKILL, enabled: false });
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(runButton()).toBeDisabled();
    expect(runButton()).toHaveAttribute("title", "Enable the skill to test it in agents");
  });

  it("is disabled with the reason when no agent has cases", async () => {
    setup({ agents: [], total_cases: 0, skipped: [], blocked: "no_agents" });
    await waitFor(() => expect(runButton()).toHaveAttribute("title", "No enabled agent that uses this skill has eval cases"));
    expect(runButton()).toBeDisabled();
  });

  it("toasts when the skill was disabled while the dialog was open", async () => {
    post.mockRejectedValue(new ApiError("disabled", 409, "skill_disabled"));
    setup(PREVIEW);
    await waitFor(() => expect(runButton()).toBeEnabled());
    fireEvent.click(runButton());
    await screen.findByText(/Security Reviewer/);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("This skill was disabled. Enable it to test it in agents."),
    );
  });
});
