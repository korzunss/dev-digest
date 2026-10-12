/* EvalsTab — the flows a reviewer walks on the Evals tab: read the metrics and
   the case list, start a confirmed suite run, run or delete a case, and meet a
   refusal. Hooks are REAL; the network edge (`api`) is stubbed. EvalCaseModal
   has its own tests, so a marker stands in for it. No
   `@testing-library/user-event` in this package. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, EvalAgentDetail, EvalCaseResult, EvalSuiteCase, EvalSuiteRun } from "@devdigest/shared";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import common from "../../../../../../../../messages/en/common.json";

const get = vi.fn();
const post = vi.fn();
const del = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p), post: (p: string, b?: unknown) => post(p, b), del: (p: string) => del(p) },
}));
const toastError = vi.fn();
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: toastError, info: vi.fn(), toast: vi.fn() }) }));
vi.mock("@/components/eval-case-modal", () => ({
  EvalCaseModal: (p: { existing?: { name: string } | null }) => <div role="dialog">case modal {p.existing?.name ?? "new"}</div>,
}));

import { ApiError } from "@/lib/api";
import { EvalsTab } from "./EvalsTab";

const AGENT = { id: "a1", name: "Security Reviewer", provider: "openai", model: "gpt-x" } as Agent;

const result = (over: Partial<EvalCaseResult> = {}): EvalCaseResult => ({
  status: "passed", expected_count: 1, actual_count: 1, must_find_total: 1, must_find_matched: 1, noise: 0, kept: 1,
  dropped: 0, duration_ms: 900, cost_usd: 0.01, error: null, ran_at: "2026-10-12T10:00:00Z", agent_version: 3, findings: [], ...over,
});

const mkCase = (id: string, name: string, over: Partial<EvalSuiteCase> = {}): EvalSuiteCase => ({
  id, agent_id: "a1", name, input: { diff: "d", files: [], pr_meta: null },
  expected: [{ expect: "must_find", file: "src/a.ts", start_line: 2, severity: "CRITICAL", category: "secrets" }],
  source: { finding_id: null, pr_id: null, repo_id: null, pr_number: null },
  created_at: "2026-10-12T09:00:00Z", updated_at: "2026-10-12T09:00:00Z", last_result: null, ...over,
});

const CASES = [
  mkCase("c1", "leaked-key", { last_result: result() }),
  mkCase("c2", "clean-refactor", { expected: [], last_result: result({ status: "failed", expected_count: 0, actual_count: 2, must_find_total: 0, must_find_matched: 0 }) }),
  mkCase("c3", "never-run-case"),
];

const run = (over: Partial<EvalSuiteRun> = {}): EvalSuiteRun => ({
  id: "r1", agent_id: "a1", agent_name: "Security Reviewer", agent_version: 3, provider: "openai", model: "gpt-x", skills: [],
  status: "completed", started_at: "2026-10-12T10:00:00Z", finished_at: "2026-10-12T10:01:00Z", cases_total: 3, cases_done: 3,
  cases_passed: 1, cases_errored: 0, metrics: { recall: 0.8, precision: 0.5, citation_accuracy: 1 }, cost_usd: 0.05, ...over,
});

function detail(over: Partial<EvalAgentDetail> = {}): EvalAgentDetail {
  return {
    agent: { id: "a1", name: "Security Reviewer", provider: "openai", model: "gpt-x", version: 3 },
    cases_total: 3, runs_total: 1, latest: run(), deltas: { recall: 0.1, precision: null, citation_accuracy: 0 }, alert: null,
    trend: [], runs: [run()], ...over,
  };
}

let cases: EvalSuiteCase[];
let det: EvalAgentDetail;
beforeEach(() => {
  cases = CASES;
  det = detail();
  get.mockImplementation(async (p: string) => {
    if (p === "/agents/a1/eval-cases") return cases;
    if (p.startsWith("/agents/a1/eval?")) return det;
    if (p === "/eval-runs/r2") return { ...run({ id: "r2", status: "running", cases_done: 1, finished_at: null }), results: [] };
    throw new Error(`unexpected GET ${p}`);
  });
});
afterEach(() => {
  cleanup();
  for (const m of [get, post, del, toastError]) m.mockReset();
});

function renderTab() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common }}>
        <EvalsTab agent={AGENT} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("EvalsTab", () => {
  it("shows the latest run's metrics and the case list with results and the passing count", async () => {
    renderTab();
    expect(await screen.findByText("leaked-key")).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument(); // cases passed card
    expect(screen.getByText("80%")).toBeInTheDocument(); // recall
    expect(screen.getByText("1 / 3 passing")).toBeInTheDocument();
    expect(screen.getAllByText("CRITICAL · secrets")).toHaveLength(2); // c1 and c3
    expect(screen.getByText("empty []")).toBeInTheDocument();
    expect(screen.getByText("expected 0 findings, got 2")).toBeInTheDocument();
    expect(screen.getByText("never run")).toBeInTheDocument(); // summary line of the never-run case
    expect(screen.getByRole("img", { name: "never run" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "failed" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "passed · recall 100%" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View full dashboard" })).toHaveAttribute("href", "/eval/a1");
  });

  // AC-18: the cards carry the deltas against the previous completed run; AC-43: no data reads "n/a".
  it("shows the AC-18 card deltas and n/a for a metric with no data", async () => {
    det = detail({
      latest: run({ metrics: { recall: 0.8, precision: null, citation_accuracy: 1 } }),
      deltas: { recall: 0.1, precision: null, citation_accuracy: -0.25 },
    });
    renderTab();
    await screen.findByText("leaked-key");
    const card = (label: string) => screen.getByText(label).parentElement!;
    // recall rose 10 points, citation fell 25, precision has no value and no delta.
    expect(within(card("Recall")).getByText("▲ 10pt")).toBeInTheDocument();
    expect(within(card("Citation accuracy")).getByText("▼ 25pt")).toBeInTheDocument();
    expect(within(card("Precision")).getByText("n/a")).toBeInTheDocument();
    expect(within(card("Precision")).queryByText(/pt$/)).toBeNull();
    expect(within(card("Precision")).queryByText("–")).toBeNull();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("shows the empty state, not rows, for a suite with no cases", async () => {
    cases = [];
    det = detail({ latest: null, cases_total: 0, runs: [], runs_total: 0, deltas: { recall: null, precision: null, citation_accuracy: null } });
    renderTab();
    expect(await screen.findByText(evalMessages.evalsTab.emptyCases)).toBeInTheDocument();
    expect(screen.getByText("No completed suite run yet.")).toBeInTheDocument();
    // AC-43: a card with no data reads "n/a" (cases passed + 3 metrics), never a dash or 0%.
    expect(screen.getAllByText("n/a")).toHaveLength(4);
    expect(screen.queryByText("0%")).toBeNull();
    // An empty suite cannot be started: nothing to run, the server would refuse with suite_empty.
    expect(screen.getByRole("button", { name: evalMessages.evalsTab.runAll })).toBeDisabled();
  });

  it("starts a suite run only after the confirm names the count and model, then shows progress", async () => {
    post.mockResolvedValue(run({ id: "r2", status: "running", cases_done: 0, finished_at: null }));
    renderTab();
    await screen.findByText("leaked-key");
    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    expect(post).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("3 cases will run on gpt-x. This calls the model and costs money.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Run" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/agents/a1/eval-runs", undefined));
    expect(await screen.findByText("Running 1 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run all evals" })).toBeDisabled();
  });

  it("states the reason when the start is refused for a missing key", async () => {
    post.mockRejectedValue(new ApiError("no API key for openai", 422, "no_api_key"));
    renderTab();
    await screen.findByText("leaked-key");
    fireEvent.click(screen.getByRole("button", { name: "Run all evals" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Run" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("No API key for openai."));
  });

  it("asks before deleting a case, then deletes it", async () => {
    del.mockResolvedValue(undefined);
    renderTab();
    await screen.findByText("leaked-key");
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]!);
    expect(del).not.toHaveBeenCalled();
    expect(screen.getByText("Delete this case?")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/eval-cases/c1"));
  });

  it("runs one case only after a confirm naming the model", async () => {
    post.mockResolvedValue(CASES[2]);
    renderTab();
    await screen.findByText("leaked-key");
    fireEvent.click(screen.getAllByRole("button", { name: "Run" })[2]!);
    expect(post).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/The case runs once on gpt-x/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Run" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/eval-cases/c3/runs", undefined));
  });

  it("opens the case editor from Edit", async () => {
    renderTab();
    await screen.findByText("leaked-key");
    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]!);
    expect(screen.getByText("case modal clean-refactor")).toBeInTheDocument();
  });

  it("offers a retry instead of controls when the cases do not load", async () => {
    get.mockRejectedValue(new Error("boom"));
    renderTab();
    expect(await screen.findByText(evalMessages.evalsTab.loadError)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run all evals" })).toBeNull();
  });
});
