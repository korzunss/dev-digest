/* AgentPerformanceView — AC-2, 3, 6, 8, 18, 18a, 19, 26, 27: default 30 days, URL on change,
   tiles, every non-data state, "Try 30 days — 42 runs", and the sidebar entry. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NAV } from "@devdigest/ui";
import type { AgentPerfDashboard } from "@devdigest/shared/contracts/agent-performance.js";
import messages from "../../../../../messages/en/agentPerformance.json";
import { figures, row, split, zeroRow } from "../AgentPerfTable/fixtures";

const get = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p) },
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const replace = vi.fn();
let params = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/agent-performance",
  useSearchParams: () => new URLSearchParams(params),
}));

import { AgentPerformanceView } from "./AgentPerformanceView";

const window_ = {
  period: "30d" as const,
  from: "2026-09-19T00:00:00.000Z",
  to: "2026-10-19T00:00:00.000Z",
  previous_from: "2026-08-20T00:00:00.000Z",
  previous_to: "2026-09-19T00:00:00.000Z",
};

const dashboard = (over: Partial<AgentPerfDashboard> = {}): AgentPerfDashboard => ({
  window: window_,
  agent_count: 2,
  totals: figures({ runs: 253, runs_not_counted: 3, total_cost_usd: 8.74, cost_split: split(8.74), accepted: 61, dismissed: 39, accept_rate: 0.61 }),
  previous_totals: { runs: 200, cost_known_runs: 200, total_cost_usd: 9.94, avg_cost_usd: 0.05, accept_rate: 0.5 },
  buckets: [
    { start: "2026-10-17T00:00", runs: 3 },
    { start: "2026-10-18T00:00", runs: 5 },
  ],
  rows: [row("Security Reviewer", { runs: 142 }), zeroRow("Idle Agent")],
  most_active: { agent_id: "00000000-0000-4000-8000-000000000001", agent_name: "Security Reviewer", runs: 142, accepted: 78, dismissed: 22, accept_rate: 0.78 },
  cost_by_agent: [{ key: "a", label: "Security Reviewer", amount_usd: 8.74, split: split(8.74) }],
  cost_by_model: [{ key: "m", label: "gpt-4.1", amount_usd: 8.74, split: split(8.74) }],
  ...over,
});

function serve(data: AgentPerfDashboard | Error, count = 42) {
  get.mockImplementation(async (path: string) => {
    if (path.startsWith("/agents/performance/runs-count")) return { runs: count };
    if (path.startsWith("/agents/performance")) {
      if (data instanceof Error) throw data;
      return data;
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
        <AgentPerformanceView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const dashboardCalls = () => get.mock.calls.map((c) => c[0] as string).filter((p) => p.startsWith("/agents/performance?"));

beforeEach(() => {
  get.mockReset();
  replace.mockReset();
  params = "";
});
afterEach(cleanup);

describe("AgentPerformanceView", () => {
  it("opens on 30 days when the URL has no period and fetches the dashboard once (AC-2)", async () => {
    serve(dashboard());
    renderView();
    await screen.findByText("253");
    expect(dashboardCalls()).toHaveLength(1);
    expect(dashboardCalls()[0]).toContain("period=30d");
    expect(screen.getByRole("button", { name: /30 days/ })).toBeInTheDocument();
  });

  it("shows the four AC-8 tiles with the failed-runs note and the most-active agent", async () => {
    serve(dashboard());
    renderView();
    await screen.findByText("253");
    expect(screen.getByText("+3 failed runs not counted")).toBeInTheDocument();
    const cost = within(screen.getByRole("region", { name: "Total cost" }));
    expect(cost.getAllByText("$8.74").length).toBeGreaterThan(0);
    expect(cost.getByText("−$1.20")).toBeInTheDocument(); // favourable delta vs the previous period (M-13)
    expect(screen.getByRole("region", { name: "Most-active agent" })).toHaveTextContent("Security Reviewer");
    expect(screen.getByRole("region", { name: "Avg accept rate" })).toHaveTextContent("61%");
    // DG3: the most-active tile says "accept", coloured by rate (DG4).
    expect(screen.getByRole("region", { name: "Most-active agent" })).toHaveTextContent("142 runs · 78% accept");
    expect(screen.getByText("78% accept").style.color).toBe("var(--ok)");
    // The table and charts render below the tiles.
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Cost breakdown")).toBeInTheDocument();
  });

  it("writes a new period into the URL (AC-3)", async () => {
    serve(dashboard());
    renderView();
    await screen.findByText("253");
    fireEvent.click(screen.getByRole("button", { name: /30 days/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "1 day" }));
    expect(replace).toHaveBeenCalledWith("/agent-performance?period=1d");
  });

  it("shows skeletons and no numbers while loading (AC-26)", () => {
    get.mockImplementation(() => new Promise(() => {}));
    const { container } = renderView();
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows an error with Retry and keeps the period control usable (AC-27)", async () => {
    serve(new Error("boom"));
    renderView();
    expect(await screen.findByText("Could not load agent performance.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /30 days/ })).toBeEnabled();
    serve(dashboard());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("253");
  });

  it("points to Agents when the workspace has none (AC-19)", async () => {
    serve(dashboard({ agent_count: 0, rows: [] }));
    renderView();
    const link = await screen.findByRole("link", { name: "Go to Agents" });
    expect(link).toHaveAttribute("href", "/agents");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows one empty state, no zero tiles, and 'Try 30 days — 42 runs' off the 30-day period (AC-18, 18a)", async () => {
    params = "period=1d";
    serve(dashboard({ totals: figures({ runs: 0, runs_not_counted: 2 }), rows: [zeroRow("Idle Agent")] }));
    renderView();
    expect(await screen.findByText("No successful runs in this period")).toBeInTheDocument();
    expect(screen.getByText("+2 failed runs not counted")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Total runs")).not.toBeInTheDocument();
    const suggestion = await screen.findByRole("button", { name: "Try 30 days — 42 runs" });
    fireEvent.click(suggestion);
    expect(replace).toHaveBeenCalledWith("/agent-performance?period=30d");
  });

  it("does not ask for the 30-day count when 30 days is already selected", async () => {
    serve(dashboard({ totals: figures({ runs: 0 }), rows: [zeroRow("Idle Agent")] }));
    renderView();
    await screen.findByText("No successful runs in this period");
    await waitFor(() => expect(get.mock.calls.some((c) => String(c[0]).includes("runs-count"))).toBe(false));
    expect(screen.queryByRole("button", { name: /Try 30 days/ })).not.toBeInTheDocument();
  });

  it("lists Agent Performance in the GLOBAL nav between Multi-Agent Review and CI Runs (AC-6)", () => {
    const global = NAV.find((g) => g.section === "GLOBAL")!;
    const keys = global.items.map((i) => i.key);
    expect(keys.indexOf("agent-performance")).toBe(keys.indexOf("multi-agent") + 1);
    expect(keys.indexOf("ci-runs")).toBe(keys.indexOf("agent-performance") + 1);
    expect(global.items.find((i) => i.key === "agent-performance")).toMatchObject({ href: "/agent-performance", label: "Agent Performance" });
  });
});
