/* AC-22 / AC-31: the same figures for one agent and one period read the same on the dashboard row,
   the Stats tab tiles and the agent card. Each surface is rendered from ONE `PerfFigures` object and
   its visible text is compared with the others, so a surface that rounds, prefixes or omits on its
   own (a `~`, "small sample", "—") diverges here. The server half (stats.figures == row.current)
   lives in `server/test/agent-performance*.it.test.ts`. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import type { AgentPerfStats, PerfFigures, PerfRow } from "@devdigest/shared/contracts/agent-performance.js";
import messages from "../../../messages/en/agentPerformance.json";
import agentsMessages from "../../../messages/en/agents.json";
import { figures, row, split } from "./_components/AgentPerfTable/fixtures";
import { AgentPerfTable } from "./_components/AgentPerfTable";
import { StatsTab } from "../agents/[id]/_components/AgentEditor/_components/StatsTab/StatsTab";
import { AgentCard } from "../agents/_components/AgentCard/AgentCard";

const get = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p) },
}));
vi.mock("@/components/run-trace-drawer", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/agents/ag1",
  useSearchParams: () => new URLSearchParams("tab=stats"),
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

function provide(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages, agents: agentsMessages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** The row's data cells in column order: runs, avg cost, avg duration, accept. */
function readRow(r: PerfRow) {
  provide(<AgentPerfTable rows={[r]} sel={{ period: "30d" }} />);
  const cells = within(screen.getByRole("rowgroup")).getAllByRole("cell");
  const text = [1, 2, 3, 4].map((i) => cells[i]!.textContent ?? "");
  cleanup();
  return { runs: text[0]!, avgCost: text[1]!, avgDuration: text[2]!, accept: text[3]! };
}

async function readTab(f: PerfFigures, previous: PerfRow["previous"]) {
  const stats: AgentPerfStats = { window: window_, agent_id: AGENT_ID, agent_name: AGENT.name, figures: f, previous, buckets: [] };
  get.mockImplementation(async (path: string) => {
    if (path.includes("/stats/runs")) return { items: [], next_cursor: null };
    if (path.includes("/stats?")) return stats;
    throw new Error(`unexpected GET ${path}`);
  });
  provide(<StatsTab agent={AGENT} />);
  const tile = async (name: string) => (await screen.findByRole("region", { name })).textContent ?? "";
  const out = {
    runs: within(await screen.findByRole("region", { name: "Total runs" })),
    avgCost: await tile("Avg cost / run"),
    avgDuration: await tile("Avg duration"),
    accept: await tile("Accept rate"),
  };
  return out;
}

beforeEach(() => {
  get.mockReset();
});
afterEach(cleanup);

describe("one agent, one period: dashboard row, Stats tab and card agree (AC-22, AC-31)", () => {
  // An estimate-tainted average over a small sample: the two spots where one surface could drop a marker.
  const estimated = figures({
    runs: 8, cost_known_runs: 8, total_cost_usd: 0.32, avg_cost_usd: 0.04, cost_split: split(0.2, 0.12),
    avg_duration_ms: 6200, accepted: 3, dismissed: 2, accept_rate: 0.6,
  });
  const previous = row("x").previous;

  it("shows identical Runs, Avg cost (with its ~), Avg duration and Accept rate with its denominator", async () => {
    const fromRow = readRow(row("Security Reviewer", estimated));
    expect(fromRow.avgCost).toBe("~$0.04");
    expect(fromRow.accept).toContain("60%");
    expect(fromRow.accept).toContain("n = 5");

    const tab = await readTab(estimated, previous);
    expect(tab.runs.getByText(fromRow.runs)).toBeInTheDocument();
    expect(tab.avgCost).toContain(fromRow.avgCost);
    expect(tab.avgDuration).toContain(fromRow.avgDuration);
    expect(tab.accept).toContain(fromRow.accept);
  });

  it("shows the same empty markers for unknown cost, unknown duration and no decisions — no zeros on either surface", async () => {
    const unknown = figures({
      runs: 3, cost_known_runs: 0, cost_unknown_runs: 3, total_cost_usd: null, avg_cost_usd: null, cost_split: split(),
      avg_duration_ms: null, accepted: 0, dismissed: 0, accept_rate: null,
    });
    const fromRow = readRow(row("Security Reviewer", unknown));
    expect(fromRow.avgDuration).toBe("—");
    expect(fromRow.accept).toBe("No decisions yet");

    const tab = await readTab(unknown, previous);
    expect(tab.avgCost).toContain(fromRow.avgCost);
    expect(tab.avgDuration).toContain(fromRow.avgDuration);
    expect(tab.accept).toContain(fromRow.accept);
  });

  it("puts the same Runs, Accept rate and Avg cost on the agent card as on the row", () => {
    const r = row("Security Reviewer", estimated);
    const fromRow = readRow(r);
    provide(<AgentCard ag={AGENT} summary={{ state: "row", row: r }} />);
    const line = document.body.textContent ?? "";
    expect(line).toContain(`${fromRow.runs} runs`);
    expect(line).toContain(`${fromRow.accept.match(/\d+%/)![0]} accept`);
    expect(line).toContain(`${fromRow.avgCost} avg`);
  });
});
