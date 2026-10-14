import type { EvalSuiteTrendPoint } from "@devdigest/shared";
import { formatCostUsd } from "@/lib/format-cost";
import { formatRunTime } from "../../../helpers";

/** One chart row: the three metrics (0..1, null = no data) plus what the tooltip shows. */
export interface TrendRow {
  run_id: string;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  version: number;
  time: string;
  cost: string;
}

/** Completed runs, oldest first, as chart rows (AC-49). The server already orders the points. */
export const trendRows = (trend: EvalSuiteTrendPoint[]): TrendRow[] =>
  trend.map((p) => ({
    run_id: p.run_id,
    recall: p.metrics.recall,
    precision: p.metrics.precision,
    citation_accuracy: p.metrics.citation_accuracy,
    version: p.agent_version,
    time: formatRunTime(p.started_at),
    cost: formatCostUsd(p.cost_usd),
  }));

/** Tooltip content for a hovered point: the version, the run time, the cost, and each metric as a percent. */
export function tooltipModel(row: TrendRow): {
  version: number;
  time: string;
  cost: string;
  metrics: { key: "recall" | "precision" | "citation_accuracy"; percent: number | null }[];
} {
  const pct = (v: number | null) => (v == null ? null : Math.round(v * 100));
  return {
    version: row.version,
    time: row.time,
    cost: row.cost,
    metrics: [
      { key: "recall", percent: pct(row.recall) },
      { key: "precision", percent: pct(row.precision) },
      { key: "citation_accuracy", percent: pct(row.citation_accuracy) },
    ],
  };
}
