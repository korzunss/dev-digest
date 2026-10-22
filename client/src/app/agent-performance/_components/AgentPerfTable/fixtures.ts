import type { PerfCostSplit, PerfFigures, PerfRow } from "@devdigest/shared/contracts/agent-performance.js";

/** Test fixtures shared by the AgentPerfTable and AgentPerformanceView tests. */
export const split = (api = 0, estimate = 0, unrecorded = 0): PerfCostSplit => ({
  api_usd: api,
  estimate_usd: estimate,
  unrecorded_usd: unrecorded,
});

export const figures = (over: Partial<PerfFigures> = {}): PerfFigures => ({
  runs: 10,
  runs_not_counted: 0,
  cost_known_runs: 10,
  cost_unknown_runs: 0,
  total_cost_usd: 0.4,
  cost_split: split(0.4),
  avg_cost_usd: 0.04,
  avg_duration_ms: 6200,
  accepted: 8,
  dismissed: 4,
  accept_rate: 8 / 12,
  last_run_at: "2026-10-19T10:00:00.000Z",
  ...over,
});

export const row = (name: string | null, over: Partial<PerfFigures> = {}, extra: Partial<PerfRow> = {}): PerfRow => ({
  kind: name === null ? "deleted" : "agent",
  agent_id: name === null ? null : `00000000-0000-4000-8000-${[...name].map((ch) => ch.charCodeAt(0).toString(16)).join("").padStart(12, "0").slice(0, 12)}`,
  agent_name: name,
  enabled: true,
  current: figures(over),
  previous: { runs: 5, cost_known_runs: 5, total_cost_usd: 0.3, avg_cost_usd: 0.05, accept_rate: 0.5 },
  recent: {
    runs: [
      { ran_at: "2026-10-19T08:00:00.000Z", duration_ms: 5000, cost_usd: 0.04, cost_source: "api" },
      { ran_at: "2026-10-19T09:00:00.000Z", duration_ms: 7000, cost_usd: 0.04, cost_source: "api" },
    ],
    avg_duration_ms: 6000,
    avg_cost_usd: 0.04,
    cost_split: split(0.08),
  },
  ...extra,
});

/** A zero-run agent: figures all empty. */
export const zeroRow = (name: string): PerfRow =>
  row(name, {
    runs: 0,
    cost_known_runs: 0,
    total_cost_usd: null,
    cost_split: split(),
    avg_cost_usd: null,
    avg_duration_ms: null,
    accepted: 0,
    dismissed: 0,
    accept_rate: null,
    last_run_at: null,
  }, { recent: { runs: [], avg_duration_ms: null, avg_cost_usd: null, cost_split: split() } });
