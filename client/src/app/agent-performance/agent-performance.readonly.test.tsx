/* AC-28: reloading, changing the period, sorting, expanding, collapsing, opening View, "Load more"
   and opening a trace only READ. The `api` mock exposes every write verb as a spy, and each GET must
   be a performance read (`/agents/performance…`, `/agents/:id/stats…` incl. `/stats/breakdown`) or the agent list — never a
   review start, a run, a provider or a model call. A write verb, or a GET anywhere else, fails here. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import type { AgentPerfDashboard, AgentPerfStats, AgentStatsBreakdown, RunHistoryItem } from "@devdigest/shared/contracts/agent-performance.js";
import messages from "../../../messages/en/agentPerformance.json";
import agentsMessages from "../../../messages/en/agents.json";
import prReview from "../../../messages/en/prReview.json";
import { figures, row, split, zeroRow } from "./_components/AgentPerfTable/fixtures";
import { AgentPerformanceView } from "./_components/AgentPerformanceView/AgentPerformanceView";
import { StatsTab } from "../agents/[id]/_components/AgentEditor/_components/StatsTab/StatsTab";
import { AgentsListView } from "../agents/_components/AgentsListView/AgentsListView";

const get = vi.fn();
const writes = { post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn(), delete: vi.fn() };
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: {
    get: (p: string) => get(p),
    post: (...a: unknown[]) => writes.post(...a),
    put: (...a: unknown[]) => writes.put(...a),
    patch: (...a: unknown[]) => writes.patch(...a),
    del: (...a: unknown[]) => writes.del(...a),
    delete: (...a: unknown[]) => writes.delete(...a),
  },
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const drawer = vi.fn();
vi.mock("@/components/run-trace-drawer", () => ({
  default: (p: { runId: string }) => {
    drawer(p.runId);
    return <div data-testid="drawer" />;
  },
}));
const replace = vi.fn();
let params = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/agent-performance",
  useSearchParams: () => new URLSearchParams(params),
}));

const AGENT_ID = "00000000-0000-4000-8000-000000000001";
const AGENT = {
  id: AGENT_ID, name: "Security Reviewer", description: "", provider: "openai", model: "gpt-4.1", system_prompt: "",
  output_schema: null, strategy: "single-pass", ci_fail_on: "critical", repo_intel: true, enabled: true, version: 1,
} as Agent;

const window_ = {
  period: "30d" as const,
  from: "2026-09-19T00:00:00.000Z",
  to: "2026-10-19T00:00:00.000Z",
  previous_from: "2026-08-20T00:00:00.000Z",
  previous_to: "2026-09-19T00:00:00.000Z",
};
const previous = { runs: 5, cost_known_runs: 5, total_cost_usd: 0.3, avg_cost_usd: 0.05, accept_rate: 0.5 };

const dashboard: AgentPerfDashboard = {
  window: window_,
  agent_count: 2,
  totals: figures({ runs: 253, accepted: 61, dismissed: 39, accept_rate: 0.61 }),
  previous_totals: previous,
  buckets: [{ start: "2026-10-18T00:00", runs: 5 }],
  rows: [row("Security Reviewer", { runs: 142 }), row("Perf Agent", { runs: 7, accepted: 1, dismissed: 3, accept_rate: 0.25 }), zeroRow("Idle Agent")],
  most_active: null,
  cost_by_agent: [{ key: "a", label: "Security Reviewer", amount_usd: 1, split: split(1) }],
  cost_by_model: [{ key: "m", label: "gpt-4.1", amount_usd: 1, split: split(1) }],
};
const stats: AgentPerfStats = { window: window_, agent_id: AGENT_ID, agent_name: AGENT.name, figures: figures({ runs: 142 }), previous, buckets: [] };
const breakdown: AgentStatsBreakdown = {
  window: window_, counted_runs: 142, local_runs: 100,
  skills: { tracked_since: null, denominator: 0, rows: [] },
  memory: { tracked_since: null, denominator: 0, rows: [] },
  findings: { total: 0, by_category: [], bucket_kind: "7d", buckets: [] },
};
const item = (n: number): RunHistoryItem => ({
  run_id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, ran_at: "2026-10-18T09:00:00.000Z", pr_number: n, tokens: 10,
  cost_usd: 0.01, cost_source: "api", findings_count: 1, source: "local", has_trace: true,
});

/** The only GETs a read-only screen may send. */
const ALLOWED = [/^\/agents\/performance(\/runs-count)?\?/, /^\/agents\/[0-9a-f-]+\/stats(\/runs|\/breakdown)?\?/, /^\/agents$/];

function serve() {
  get.mockImplementation(async (path: string) => {
    if (path.startsWith("/agents/performance")) return dashboard;
    if (path.includes("/stats/breakdown")) return breakdown;
    if (path.includes("/stats/runs")) return path.includes("cursor=c1") ? { items: [item(3)], next_cursor: null } : { items: [item(1), item(2)], next_cursor: "c1" };
    if (path.includes("/stats?")) return stats;
    if (path === "/agents") return [{ ...AGENT, id: dashboard.rows[0]!.agent_id }];
    throw new Error(`unexpected GET ${path}`);
  });
}

function mount(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages, agents: agentsMessages, prReview }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function expectOnlyReads() {
  for (const [verb, spy] of Object.entries(writes)) expect(spy, `api.${verb} was called`).not.toHaveBeenCalled();
  const paths = get.mock.calls.map((c) => c[0] as string);
  expect(paths.length).toBeGreaterThan(0);
  for (const p of paths) expect(ALLOWED.some((re) => re.test(p)), `unexpected GET ${p}`).toBe(true);
  expect(paths.filter((p) => /review|provider|model|\/runs\/|trigger/.test(p.replace(/\?.*$/, "")))).toEqual([]);
}

beforeEach(() => {
  get.mockReset();
  replace.mockReset();
  drawer.mockReset();
  for (const spy of Object.values(writes)) spy.mockReset();
  params = "";
  serve();
});
afterEach(cleanup);

describe("Agent Performance screens only read (AC-28)", () => {
  it("dashboard: reload, period change, sort, expand and collapse send no write and no model call", async () => {
    const first = mount(<AgentPerformanceView />);
    await screen.findByText("253");
    // sort twice (direction flip), expand and collapse a row
    fireEvent.click(screen.getByRole("button", { name: "Sort by Runs" }));
    fireEvent.click(screen.getByRole("button", { name: "Sort by Runs" }));
    fireEvent.click(screen.getByRole("button", { name: "Show recent runs of Security Reviewer" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide recent runs of Security Reviewer" }));
    // change the period through the control, then "reload" on the new URL and on the old one
    fireEvent.click(screen.getByRole("button", { name: /30 days/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "1 day" }));
    expect(replace).toHaveBeenCalledWith("/agent-performance?period=1d");
    first.unmount();
    params = "period=1d";
    mount(<AgentPerformanceView />);
    await screen.findByText("253");

    expect(get.mock.calls.length).toBeGreaterThanOrEqual(2);
    expectOnlyReads();
  });

  it("dashboard: the View link is a plain link to the agent's Stats tab, not an action", async () => {
    mount(<AgentPerformanceView />);
    await screen.findByText("253");
    const link = screen.getByRole("link", { name: "View Security Reviewer" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toMatch(/^\/agents\/[^?]+\?tab=stats&period=30d$/);
    link.addEventListener("click", (e) => e.preventDefault()); // jsdom cannot navigate
    fireEvent.click(link);
    expectOnlyReads();
  });

  it("Stats tab: Load more and View trace only read", async () => {
    params = "tab=stats";
    mount(<StatsTab agent={AGENT} />);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "View trace" })).toHaveLength(3));
    fireEvent.click(screen.getAllByRole("button", { name: "View trace" })[0]!);
    expect(drawer).toHaveBeenCalledTimes(1);
    expect(get.mock.calls.map((c) => c[0] as string).some((p) => p.includes("cursor=c1"))).toBe(true);
    expectOnlyReads();
  });

  it("agent list: opening /agents sends the list and one 30-day dashboard read, nothing else", async () => {
    mount(<AgentsListView />);
    await waitFor(() => expect(document.body.textContent).toMatch(/142 runs · .* accept · \$0\.04 avg/));
    expectOnlyReads();
  });
});
