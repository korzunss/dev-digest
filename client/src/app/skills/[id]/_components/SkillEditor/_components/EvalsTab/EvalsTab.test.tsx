/* Skill EvalsTab — the flows a skill author walks: read the suite, start it on
   a model (default or picked), see a refusal. Hooks are REAL; the network edge
   (`api`) is stubbed, so the assertions are about what is sent and shown. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalSkillRunState, EvalSuiteCase, Skill } from "@devdigest/shared";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import common from "../../../../../../../../messages/en/common.json";
import shell from "../../../../../../../../messages/en/shell.json";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p), post: (p: string, b?: unknown) => post(p, b), put: vi.fn(), delete: vi.fn() },
}));
const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: toastSuccess, error: toastError, info: vi.fn(), toast: vi.fn() }) }));

import { ApiError } from "@/lib/api";
import { EvalsTab } from "./EvalsTab";

const SKILL: Skill = {
  id: "s1", name: "secret-gate", description: "d", type: "security", source: "manual", body: "# b",
  enabled: true, version: 3, evidence_files: null, agent_count: 1, pull_rate: null, accept_rate: null,
};

const mkCase = (id: string, name: string, created: string, status?: "passed" | "failed"): EvalSuiteCase => ({
  id, agent_id: null, skill_id: "s1", name,
  input: { diff: "d", files: [], pr_meta: null },
  expected: [{ expect: "must_find", file: "a.ts", start_line: 1, severity: "CRITICAL", category: "security" }],
  source: { finding_id: null, pr_id: null, repo_id: null, pr_number: null },
  created_at: created, updated_at: created,
  last_result: status
    ? { status, expected_count: 1, actual_count: 1, must_find_total: 1, must_find_matched: 1, noise: 0, kept: 1, dropped: 0,
        duration_ms: 1, cost_usd: 0, error: null, ran_at: created, skill_version: 3, model: "gpt-x", findings: [] }
    : null,
});

const CASES = [
  mkCase("c1", "older-case", "2026-10-10T09:00:00Z", "passed"),
  mkCase("c2", "newer-case", "2026-10-12T09:00:00Z", "failed"),
];

const state = (over: Partial<EvalSkillRunState> = {}): EvalSkillRunState => ({
  skill: { id: "s1", name: "secret-gate", version: 3, enabled: true },
  progress: null,
  default_pick: { provider: "openai", model: "gpt-x" },
  ...over,
});

function setup(cases: EvalSuiteCase[], runState: EvalSkillRunState, skill: Skill = SKILL) {
  get.mockImplementation(async (p: string) => {
    if (p === "/skills/s1/eval-cases") return cases;
    if (p === "/skills/s1/eval-run") return runState;
    return [];
  });
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common, shell }}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <EvalsTab skill={skill} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

// The modal is rendered after the list, so its "Run" is the last one (rows have "Run" buttons too).
const confirmButton = () => screen.getAllByRole("button", { name: "Run" }).at(-1) as HTMLElement;

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});
afterEach(cleanup);

describe("skill EvalsTab", () => {
  // The single-case run answers a plain case (no `outside_applies_to`); the badge must come from the refetched list.
  it("refetches the case list after a single-case run so the outside-Applies-to badge stays correct", async () => {
    const flagged = { ...mkCase("c3", "outside-case", "2026-10-13T09:00:00Z"), outside_applies_to: true };
    let listCalls = 0;
    get.mockImplementation(async (p: string) => {
      if (p === "/skills/s1/eval-cases") {
        listCalls++;
        return [flagged];
      }
      if (p === "/skills/s1/eval-run") return state();
      return [];
    });
    // The run response carries no outside_applies_to, as the server's does.
    const { outside_applies_to: _omit, ...plain } = flagged;
    post.mockResolvedValue({ ...plain, last_result: CASES[0]!.last_result });
    render(
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common, shell }}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <EvalsTab skill={SKILL} />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );
    await screen.findByText("outside-case");
    expect(screen.getAllByText("Outside Applies to")).toHaveLength(1);
    const before = listCalls;

    fireEvent.click(screen.getAllByRole("button", { name: "Run" })[0] as HTMLElement);
    await screen.findByText(evalMessages.modal.runConfirmTitle);
    fireEvent.click(confirmButton());

    await waitFor(() => expect(post).toHaveBeenCalledWith("/eval-cases/c3/runs", { provider: "openai", model: "gpt-x" }));
    await waitFor(() => expect(listCalls).toBeGreaterThan(before));
    expect(await screen.findByText("Outside Applies to")).toBeInTheDocument();
  });

  it("flags a case whose files fall outside the skill's Applies to", async () => {
    const outside = { ...mkCase("c3", "outside-case", "2026-10-13T09:00:00Z"), outside_applies_to: true };
    setup([outside, mkCase("c1", "older-case", "2026-10-10T09:00:00Z")], state());
    await screen.findByText("outside-case");
    expect(screen.getAllByText("Outside Applies to")).toHaveLength(1);
  });

  it("lists cases newest first with the passing count, and starts the suite on the default model after a confirm", async () => {
    post.mockResolvedValue(state({ progress: { done: 0, total: 2 } }));
    setup(CASES, state());
    await screen.findByText("newer-case");
    const names = screen.getAllByText(/-case$/).map((n) => n.textContent);
    expect(names).toEqual(["newer-case", "older-case"]);
    expect(screen.getByText("1 / 2 passing")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    await screen.findByText("Run all evals?");
    expect(screen.getByText(/2 cases will run/)).toBeInTheDocument();
    fireEvent.click(confirmButton());

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/skills/s1/eval-runs", { provider: "openai", model: "gpt-x", confirm: true }),
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
  });

  it("keeps Run disabled until a model is picked when the skill has no default", async () => {
    setup(CASES, state({ default_pick: null }));
    await screen.findByText("newer-case");
    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    await screen.findByText("Run all evals?");
    expect(confirmButton()).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });

  it("shows the empty state with the run disabled and the reason, and notes a disabled skill", async () => {
    setup([], state(), { ...SKILL, enabled: false });
    await screen.findByText(/No eval cases yet/);
    const run = screen.getByRole("button", { name: "Run all evals" });
    expect(run).toBeDisabled();
    expect(run).toHaveAttribute("title", "Add an eval case before running the suite.");
    expect(screen.getByText(/This skill is disabled/)).toBeInTheDocument();
  });

  it("shows progress while the suite runs and blocks a second start", async () => {
    setup(CASES, state({ progress: { done: 1, total: 2 } }));
    expect(await screen.findByText("Running 1 / 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeDisabled();
  });

  it("maps a refused start to its message", async () => {
    post.mockRejectedValue(new ApiError("busy", 409, "run_in_progress"));
    setup(CASES, state());
    await screen.findByText("newer-case");
    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    await screen.findByText("Run all evals?");
    fireEvent.click(confirmButton());
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("A run is already in progress for this skill."));
  });
});
