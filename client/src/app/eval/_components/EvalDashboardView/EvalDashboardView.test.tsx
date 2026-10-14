/* EvalDashboardView — what a reviewer sees on the Eval Dashboard: every agent
   with its latest metrics (never-run ones marked), the recent runs, and the
   confirmed "Run all agents" flow. Hooks are REAL; the network edge (`api`) is
   stubbed. No `@testing-library/user-event` in this package. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalDashboardView as Dashboard, EvalRunAllPreview, EvalSuiteRun } from "@devdigest/shared";
import { NAV } from "@devdigest/ui";
import evalMessages from "../../../../../messages/en/eval.json";
import common from "../../../../../messages/en/common.json";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p), post: (p: string, b?: unknown) => post(p, b) },
}));
const toastSuccess = vi.fn();
const toastInfo = vi.fn();
const toastError = vi.fn();
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: toastSuccess, error: toastError, info: toastInfo, toast: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import { EvalDashboardView } from "./EvalDashboardView";

const run = (id: string, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun => ({
  id, agent_id: "a1", agent_name: "Security Reviewer", agent_version: 7, provider: "openai", model: "gpt-x", skills: [],
  status: "completed", started_at: "2026-05-29T09:14:00Z", finished_at: "2026-05-29T09:20:00Z", cases_total: 20, cases_done: 20,
  cases_passed: 17, cases_errored: 0, metrics: { recall: 0.82, precision: 0.91, citation_accuracy: 0.95 }, cost_usd: 0.23, ...over,
});

const VIEW: Dashboard = {
  agents: [
    { agent_id: "a1", name: "Security Reviewer", model: "gpt-x", enabled: true, cases_total: 20, latest: run("r1"), sparkline: [0.7, 0.8, 0.82] },
    { agent_id: "a2", name: "Fresh Agent", model: "gpt-y", enabled: true, cases_total: 0, latest: null, sparkline: [] },
  ],
  recent_runs: [
    run("r1"),
    run("r2", { agent_id: "a3", agent_name: "Performance Reviewer", agent_version: 4, cases_passed: 13, cases_total: 18, started_at: "2026-05-28T13:20:00Z" }),
  ],
};

const PREVIEW: EvalRunAllPreview = {
  agents: [{ agent_id: "a1", name: "Security Reviewer", model: "gpt-x", cases: 20 }],
  total_cases: 20,
  skipped: [
    { agent_id: "a3", name: "Performance Reviewer", provider: "openai", reason: "run_in_progress" },
    { agent_id: "a4", name: "Docs Reviewer", provider: "anthropic", reason: "no_api_key" },
  ],
};

beforeEach(() => {
  get.mockImplementation(async (p: string) => {
    if (p === "/eval/dashboard") return VIEW;
    if (p === "/eval/run-all") return PREVIEW;
    throw new Error(`unexpected GET ${p}`);
  });
});
afterEach(() => {
  cleanup();
  for (const m of [get, post, toastSuccess, toastInfo, toastError]) m.mockReset();
});

function renderView() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common }}>
        <EvalDashboardView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("EvalDashboardView", () => {
  it("lists agents with their latest run and marks one that never ran, then the recent runs", async () => {
    renderView();
    const first = (await screen.findByRole("link", { name: /Security Reviewer/ })) as HTMLAnchorElement;
    expect(first.getAttribute("href")).toBe("/eval/a1");
    expect(within(first).getByText("82%")).toBeInTheDocument();
    expect(within(first).getByText(/v7 · 2026-05-29 09:14 · 17\/20 passed/)).toBeInTheDocument();
    const fresh = screen.getByRole("link", { name: /Fresh Agent/ });
    expect(within(fresh).getByText("never run")).toBeInTheDocument();
    expect(within(fresh).getAllByText("n/a").length).toBe(3); // AC-43: never "–" or 0%
    expect(within(fresh).queryByText("0%")).toBeNull();
    // Recent runs: agent, version and pass count of an agent that is not in the list above.
    expect(screen.getByText("Performance Reviewer")).toBeInTheDocument();
    expect(screen.getByText("13/18")).toBeInTheDocument();
    expect(screen.getByText("v4")).toBeInTheDocument();
  });

  it("offers the dashboard in the sidebar", () => {
    const item = NAV.flatMap((g) => g.items).find((i) => i.key === "eval");
    expect(item).toMatchObject({ label: "Eval Dashboard", href: "/eval" });
  });

  it("asks before running every agent, names the skipped one, and starts the runs on confirm", async () => {
    post.mockResolvedValue({ started: [{ agent_id: "a1", run_id: "r9" }], skipped: PREVIEW.skipped });
    renderView();
    await screen.findByText("Fresh Agent");
    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/20 cases across 1 agent will run/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Security Reviewer · gpt-x · 20 cases/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Performance Reviewer · skipped: a run is already in progress/)).toBeInTheDocument();
    // AC-79: a keyless agent is skipped and the reason names its provider.
    expect(within(dialog).getByText(/Docs Reviewer · skipped: no API key for anthropic/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Run" }));
    // SF1: the paid POST carries a JSON body so a cross-origin no-cors request cannot start it.
    await waitFor(() => expect(post).toHaveBeenCalledWith("/eval/run-all", { confirm: true }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Started 1 run"));
    expect(toastInfo).toHaveBeenCalledWith(expect.stringContaining("Performance Reviewer"));
    expect(toastInfo).toHaveBeenCalledWith(expect.stringContaining("no API key for anthropic"));
  });

  it("disables the run when no agent has cases", async () => {
    get.mockImplementation(async (p: string) =>
      p === "/eval/run-all" ? { agents: [], total_cases: 0, skipped: [] } : VIEW,
    );
    renderView();
    await screen.findByText("Fresh Agent");
    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(evalMessages.dashboard.runAllNothing)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Run" })).toBeDisabled();
  });

  it("shows an error with a retry when the dashboard cannot load", async () => {
    get.mockRejectedValue(new Error("boom"));
    renderView();
    expect(await screen.findByText(evalMessages.dashboard.loadError)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run all agents" })).toBeNull();
  });
});
