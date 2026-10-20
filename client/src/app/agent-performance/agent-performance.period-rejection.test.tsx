/* AC-4 at the screen level, on both screens (AC-20 reuses the control): a custom range that ends in the
   future, starts after it ends or is over 365 days is refused with an inline message, the URL is not
   written, no new request is sent and the previous valid period's figures stay on screen. A valid range
   afterwards DOES write the URL, so the same steps can see a write. Dates are chosen so the verdict does
   not depend on the clock: a far-future end, a reversed pair, a multi-year past range. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import type { AgentPerfDashboard, AgentPerfStats } from "@devdigest/shared/contracts/agent-performance.js";
import messages from "../../../messages/en/agentPerformance.json";
import { figures, row } from "./_components/AgentPerfTable/fixtures";
import { AgentPerformanceView } from "./_components/AgentPerformanceView/AgentPerformanceView";
import { StatsTab } from "../agents/[id]/_components/AgentEditor/_components/StatsTab/StatsTab";

const get = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p) },
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/run-trace-drawer", () => ({ default: () => null }));
const replace = vi.fn();
let params = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/here",
  useSearchParams: () => new URLSearchParams(params),
}));

const AGENT_ID = "00000000-0000-4000-8000-000000000001";
const AGENT = { id: AGENT_ID, name: "Security Reviewer" } as Agent;
const window_ = {
  period: "30d" as const,
  from: "2026-09-19T00:00:00.000Z",
  to: "2026-10-19T00:00:00.000Z",
  previous_from: "2026-08-20T00:00:00.000Z",
  previous_to: "2026-09-19T00:00:00.000Z",
};
const previous = { runs: 5, cost_known_runs: 5, total_cost_usd: 0.3, avg_cost_usd: 0.05, accept_rate: 0.5 };
const dashboard: AgentPerfDashboard = {
  window: window_, agent_count: 1, totals: figures({ runs: 253 }), previous_totals: previous, buckets: [],
  rows: [row("Security Reviewer", { runs: 142 })], most_active: null, cost_by_agent: [], cost_by_model: [],
};
const stats: AgentPerfStats = { window: window_, agent_id: AGENT_ID, agent_name: AGENT.name, figures: figures({ runs: 142 }), previous, buckets: [] };

beforeEach(() => {
  get.mockReset();
  replace.mockReset();
  params = "";
  get.mockImplementation(async (path: string) => {
    if (path.startsWith("/agents/performance")) return dashboard;
    if (path.includes("/stats/runs")) return { items: [], next_cursor: null };
    if (path.includes("/stats?")) return stats;
    throw new Error(`unexpected GET ${path}`);
  });
});
afterEach(cleanup);

function mount(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function enterCustom(from: string, to: string) {
  // A refused range leaves the menu open on its form, so only open it the first time.
  if (!screen.queryByLabelText("From")) {
    fireEvent.click(screen.getByRole("button", { name: /30 days/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Custom" }));
  }
  fireEvent.change(screen.getByLabelText("From"), { target: { value: from } });
  fireEvent.change(screen.getByLabelText("To"), { target: { value: to } });
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
}

const BAD: [string, string, string, RegExp][] = [
  ["ends in the future", "2026-01-01", "2999-01-01", /future/],
  ["starts after it ends", "2026-02-01", "2026-01-01", /on or before/],
  ["is over 365 days", "2018-01-01", "2020-01-01", /365 days/],
];

describe.each([
  ["dashboard", () => <AgentPerformanceView />, "253"],
  ["Stats tab", () => <StatsTab agent={AGENT} />, "142"],
] as const)("%s refuses an invalid custom range (AC-4)", (_name, ui, shown) => {
  it("keeps the URL, the request count and the previous figures for each violation", async () => {
    params = "tab=stats";
    mount(ui());
    await screen.findByText(shown);
    const requests = get.mock.calls.length;

    for (const [what, from, to, message] of BAD) {
      enterCustom(from, to);
      expect(screen.getByRole("alert"), what).toHaveTextContent(message);
      expect(replace, what).not.toHaveBeenCalled();
      expect(get.mock.calls.length, what).toBe(requests);
      expect(screen.getByText(shown), what).toBeInTheDocument();
    }
  });

  it("writes the URL for a valid custom range, so the checks above can see a write", async () => {
    params = "tab=stats";
    mount(ui());
    await screen.findByText(shown);
    enterCustom("2026-09-01", "2026-09-30");
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0]![0] as string).toContain("period=custom&from=2026-09-01&to=2026-09-30");
  });
});
