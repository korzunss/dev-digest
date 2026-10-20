/* AgentsListView — AC-31: every card's 30-day line comes from ONE dashboard request; a failed
   request drops the lines and leaves the list usable (AC-32). */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentPerfDashboard } from "@devdigest/shared/contracts/agent-performance.js";
import messages from "../../../../../messages/en/agents.json";
import perfMessages from "../../../../../messages/en/agentPerformance.json";
import { figures, row, split, zeroRow } from "../../../agent-performance/_components/AgentPerfTable/fixtures";

const get = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

import { AgentsListView } from "./AgentsListView";

const mkAgent = (name: string) => {
  const r = row(name);
  return {
    id: r.agent_id!,
    name,
    description: "",
    provider: "openai",
    model: "gpt-4.1",
    system_prompt: "",
    output_schema: null,
    strategy: "single-pass",
    ci_fail_on: "critical",
    repo_intel: true,
    enabled: true,
    version: 1,
  };
};

const dashboard: AgentPerfDashboard = {
  window: { period: "30d", from: "2026-09-19T00:00:00.000Z", to: "2026-10-19T00:00:00.000Z", previous_from: "2026-08-20T00:00:00.000Z", previous_to: "2026-09-19T00:00:00.000Z" },
  agent_count: 2,
  totals: figures(),
  previous_totals: { runs: 0, cost_known_runs: 0, total_cost_usd: null, avg_cost_usd: null, accept_rate: null },
  buckets: [],
  rows: [row("Security Reviewer", { runs: 142, accept_rate: 0.78, avg_cost_usd: 0.04, cost_split: split(5.68) }), zeroRow("Idle Agent")],
  most_active: null,
  cost_by_agent: [],
  cost_by_model: [],
};

function serve(perf: AgentPerfDashboard | Error) {
  get.mockImplementation(async (path: string) => {
    if (path.startsWith("/agents/performance")) {
      if (perf instanceof Error) throw perf;
      return perf;
    }
    if (path.startsWith("/agents")) return [mkAgent("Security Reviewer"), mkAgent("Idle Agent")];
    throw new Error(`unexpected GET ${path}`);
  });
}

function renderList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages, agentPerformance: perfMessages }}>
        <AgentsListView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
});
afterEach(cleanup);

describe("AgentsListView summary lines", () => {
  it("feeds every card from one 30-day dashboard request (AC-30, AC-31)", async () => {
    serve(dashboard);
    renderList();
    await waitFor(() => expect(document.body).toHaveTextContent("142 runs · 78% accept · $0.04 avg"));
    expect(screen.getByText("No runs in 30 days")).toBeInTheDocument();
    const perfCalls = get.mock.calls.map((c) => c[0] as string).filter((p) => p.startsWith("/agents/performance"));
    expect(perfCalls).toHaveLength(1);
    expect(perfCalls[0]).toContain("period=30d");
  });

  it("omits the lines when the figures fail to load and keeps the cards usable (AC-32)", async () => {
    serve(new Error("boom"));
    renderList();
    expect(await screen.findAllByText("Security Reviewer")).not.toHaveLength(0);
    await vi.waitFor(() => expect(get.mock.calls.some((c) => (c[0] as string).startsWith("/agents/performance"))).toBe(true));
    expect(screen.queryByText(/ avg$/)).not.toBeInTheDocument();
    expect(screen.queryByText("No runs in 30 days")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Delete/i }).length).toBeGreaterThan(0);
  });
});
