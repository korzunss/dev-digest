/* AgentEvalDetail — what a reviewer does on one agent's eval page: reads the
   metrics, the regression banner and the runs, changes the period or the
   agent, picks two runs to compare, and starts a confirmed run. Hooks are
   REAL; the network edge (`api`) and the router are stubbed. No
   `@testing-library/user-event` in this package. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalAgentDetail, EvalSuiteRun } from "@devdigest/shared";
import evalMessages from "../../../../../../messages/en/eval.json";
import common from "../../../../../../messages/en/common.json";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p), post: (p: string, b?: unknown) => post(p, b) },
}));
const toastError = vi.fn();
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: toastError, info: vi.fn(), toast: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const push = vi.fn();
const replace = vi.fn();
let query = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(query),
}));
// Recharts measures its container, which jsdom cannot lay out; the chart's own mapping is tested in EvalTrendChart/helpers.test.ts.
vi.mock("../EvalTrendChart", () => ({
  EvalTrendChart: (p: { trend: unknown[] }) => <div data-testid="trend-chart">{p.trend.length} points</div>,
}));
vi.mock("../CompareRunsModal", () => ({
  CompareRunsModal: (p: { runIds: string[] }) => <div role="dialog">compare {p.runIds.join(",")}</div>,
}));

import { ApiError } from "@/lib/api";
import { AgentEvalDetail } from "./AgentEvalDetail";

const run = (id: string, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun => ({
  id, agent_id: "a1", agent_name: "Security Reviewer", agent_version: 7, provider: "openai", model: "gpt-x", skills: [],
  status: "completed", started_at: "2026-05-29T09:14:00Z", finished_at: "2026-05-29T09:20:00Z", cases_total: 20, cases_done: 20,
  cases_passed: 17, cases_errored: 0, metrics: { recall: 0.82, precision: 0.91, citation_accuracy: 0.95 }, cost_usd: 0.23, ...over,
});

const RUNS = [
  run("r7"),
  run("r6", { agent_version: 6, started_at: "2026-05-27T16:40:00Z", cases_passed: 16, cases_errored: 2, cost_usd: 0.21, metrics: { recall: 0.78, precision: 0.93, citation_accuracy: 0.94 } }),
  run("r5", { agent_version: 5, started_at: "2026-05-25T11:02:00Z", cases_passed: 16 }),
];

const DETAIL: EvalAgentDetail = {
  agent: { id: "a1", name: "Security Reviewer", provider: "openai", model: "gpt-x", version: 7 },
  cases_total: 20, runs_total: 3, latest: RUNS[0]!,
  deltas: { recall: 0.04, precision: -0.02, citation_accuracy: 0.01 },
  alert: { version: 7, dropped: [{ metric: "precision", points: 2 }], rose: [{ metric: "recall", points: 4 }] },
  trend: RUNS.map((r) => ({ run_id: r.id, started_at: r.started_at, agent_version: r.agent_version, cost_usd: r.cost_usd, metrics: r.metrics })),
  runs: RUNS,
};

let detail: EvalAgentDetail;
beforeEach(() => {
  query = "";
  detail = DETAIL;
  get.mockImplementation(async (p: string) => {
    if (p === "/agents") return [{ id: "a1", name: "Security Reviewer" }, { id: "a2", name: "Perf Reviewer" }];
    if (p.startsWith("/agents/a1/eval?")) return detail;
    throw new Error(`unexpected GET ${p}`);
  });
});
afterEach(() => {
  cleanup();
  for (const m of [get, post, toastError, push, replace]) m.mockReset();
});

function renderDetail() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common }}>
        <AgentEvalDetail agentId="a1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("AgentEvalDetail", () => {
  it("shows the agent, its metrics, the regression banner and the runs newest first", async () => {
    renderDetail();
    expect(await screen.findByRole("heading", { name: "Security Reviewer" })).toBeInTheDocument();
    expect(screen.getByText("gpt-x")).toBeInTheDocument();
    expect(screen.getByTestId("trend-chart")).toHaveTextContent("3 points");
    expect(screen.getByText("3 runs on the 20-case suite", { exact: false })).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Regression in v7")).toBeInTheDocument();
    expect(within(alert).getByText("Precision dropped 2 pts")).toBeInTheDocument();
    expect(within(alert).getByText("Recall rose 4 pts")).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("2026-05-29 09:14");
    expect(rows[0]).toHaveTextContent("v7");
    expect(rows[0]).toHaveTextContent("17/20");
    expect(rows[0]).toHaveTextContent("$0.23");
    // AC-48: each row carries its metric values next to the bars.
    expect(rows[0]).toHaveTextContent("82%");
    expect(rows[0]).toHaveTextContent("91%");
    expect(rows[0]).toHaveTextContent("95%");
    // Errored count only where it is above zero.
    expect(rows[1]).toHaveTextContent("2 errored cases");
    expect(rows[0]).not.toHaveTextContent("errored");
  });

  it("asks the server for the period in the URL and writes a new one back to it", async () => {
    query = "period=all";
    renderDetail();
    await screen.findByRole("heading", { name: "Security Reviewer" });
    expect(get).toHaveBeenCalledWith("/agents/a1/eval?period=all");
    fireEvent.click(screen.getByRole("button", { name: "Period" }));
    fireEvent.click(screen.getByText("30 days"));
    expect(replace).toHaveBeenCalledWith("/eval/a1?period=30d");
  });

  it("opens another agent's page from the switcher, keeping the period", async () => {
    renderDetail();
    await screen.findByRole("heading", { name: "Security Reviewer" });
    fireEvent.click(screen.getByRole("button", { name: "Agent" }));
    fireEvent.click(await screen.findByText("Perf Reviewer"));
    expect(push).toHaveBeenCalledWith("/eval/a2?period=30d");
  });

  it("enables Compare only while exactly two runs are selected", async () => {
    renderDetail();
    await screen.findByRole("heading", { name: "Security Reviewer" });
    const compare = screen.getByRole("button", { name: "Compare" });
    expect(compare).toBeDisabled();
    const pick = (time: string) => fireEvent.click(screen.getByRole("checkbox", { name: `Select run ${time}` }));
    pick("2026-05-29 09:14");
    expect(compare).toBeDisabled();
    pick("2026-05-27 16:40");
    expect(compare).toBeEnabled();
    pick("2026-05-25 11:02");
    expect(compare).toBeDisabled();
    pick("2026-05-25 11:02");
    fireEvent.click(compare);
    expect(await screen.findByRole("dialog")).toHaveTextContent("compare r7,r6");
  });

  it("confirms a run with the case count and model, starts it, and reports a refusal", async () => {
    post.mockRejectedValue(new ApiError("no key", 422, "no_api_key"));
    renderDetail();
    await screen.findByRole("heading", { name: "Security Reviewer" });
    fireEvent.click(screen.getByRole("button", { name: "Run eval" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("20 cases will run on gpt-x. This calls the model and costs money.")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Run" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/agents/a1/eval-runs", undefined));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("No API key for openai."));
  });

  it("says so when there are no completed runs yet", async () => {
    detail = { ...DETAIL, latest: null, alert: null, trend: [], runs: [], runs_total: 0, deltas: { recall: null, precision: null, citation_accuracy: null } };
    renderDetail();
    expect(await screen.findByText(evalMessages.detail.trendEmpty)).toBeInTheDocument();
    expect(screen.getByText(evalMessages.detail.runsEmpty)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
