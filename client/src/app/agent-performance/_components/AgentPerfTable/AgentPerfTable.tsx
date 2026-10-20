/* AgentPerfTable — one row per agent (+ a Deleted agents row), client-side sort (AC-9…AC-12),
   in-place expand with the last 5 runs (AC-15) and a View link to the Stats tab (AC-16). */
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PerfRow } from "@devdigest/shared/contracts/agent-performance.js";
import { AcceptRate, CostAmount, SafeSparkline, formatDuration, provenanceOf } from "@/components/perf-kit";
import { formatCostUsd } from "@/lib/format-cost";
import { toSearch, type PeriodSel } from "@/lib/period";
import { sortRows, type SortDir, type SortKey } from "./helpers";
import { s } from "./styles";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "runs", label: "runs" },
  { key: "avgCost", label: "avgCost" },
  { key: "avgDuration", label: "avgDuration" },
  { key: "accept", label: "accept" },
  { key: "lastRun", label: "lastRun" },
];

const rowKey = (row: PerfRow) => row.agent_id ?? "deleted";

function PerfRowView({ row, sel, expanded, onToggle }: { row: PerfRow; sel: PeriodSel; expanded: boolean; onToggle: () => void }) {
  const t = useTranslations("agentPerformance");
  const format = useFormatter();
  const c = row.current;
  const deleted = row.kind === "deleted";
  const name = deleted ? t("table.deleted") : (row.agent_name ?? "");
  const hasRuns = c.runs > 0;

  const durations = row.recent.runs.map((r) => r.duration_ms).filter((d): d is number => d != null);
  const view = deleted ? null : (
    <Link
      href={`/agents/${row.agent_id}?${new URLSearchParams([["tab", "stats"], ...toSearch(sel)]).toString()}`}
      style={s.view}
      aria-label={t("table.viewAgent", { name })}
      onClick={(e) => e.stopPropagation()}
    >
      {t("table.view")}
    </Link>
  );

  const nameCell = (
    <>
      <span style={s.agentIcon} aria-hidden="true">
        <Icon.Cpu size={16} />
      </span>
      <span style={s.agentName} title={name}>
        {name}
      </span>
      {row.enabled === false && <span style={s.badge}>{t("table.disabled")}</span>}
    </>
  );

  return (
    <div style={s.rowWrap} role="rowgroup">
      <div style={hasRuns ? s.rowClickable : s.row} role="row" onClick={hasRuns ? onToggle : undefined}>
        <div style={s.agentCell} role="cell">
          {hasRuns ? (
            <button
              type="button"
              style={s.toggle}
              aria-expanded={expanded}
              aria-label={t(expanded ? "table.collapse" : "table.expand", { name })}
            >
              {nameCell}
            </button>
          ) : (
            nameCell
          )}
        </div>
        {hasRuns ? (
          <>
            <span className="tnum" role="cell">
              {c.runs}
            </span>
            <span role="cell">
              <CostAmount value={c.avg_cost_usd} split={c.cost_split} />
            </span>
            <span className="tnum" role="cell">
              {formatDuration(c.avg_duration_ms)}
            </span>
            <span role="cell">
              <AcceptRate rate={c.accept_rate} accepted={c.accepted} dismissed={c.dismissed} previousRate={row.previous.accept_rate} />
            </span>
            <span style={s.muted} role="cell">
              {c.last_run_at ? format.relativeTime(new Date(c.last_run_at), new Date()) : "—"}
            </span>
          </>
        ) : (
          <span style={s.noRuns} role="cell">
            {t("table.noRuns")}
          </span>
        )}
        <span role="cell">{view}</span>
      </div>
      {hasRuns && expanded && (
        <div style={s.expanded}>
          <SafeSparkline data={durations} label={t("table.recentLabel", { n: row.recent.runs.length })} w={170} />
          <span className="tnum">
            {t("table.recent", {
              n: row.recent.runs.length,
              duration: formatDuration(row.recent.avg_duration_ms),
              cost: formatCostUsd(row.recent.avg_cost_usd, provenanceOf(row.recent.cost_split)),
            })}
          </span>
        </div>
      )}
    </div>
  );
}

export function AgentPerfTable({ rows, sel }: { rows: PerfRow[]; sel: PeriodSel }) {
  const t = useTranslations("agentPerformance");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "accept", dir: "desc" });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const sorted = sortRows(rows, sort.key, sort.dir);

  const toggleSort = (key: SortKey) =>
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  const toggleRow = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div style={s.table} role="table">
      <div style={s.headRow} role="row">
        <span style={s.headCellStatic} role="columnheader">
          {t("table.agent")}
        </span>
        {COLUMNS.map((col) => {
          const active = sort.key === col.key;
          const label = t(`table.${col.label}`);
          return (
            <span key={col.key} role="columnheader" aria-sort={active ? (sort.dir === "desc" ? "descending" : "ascending") : "none"}>
              <button type="button" style={s.headCell} aria-label={t("table.sortBy", { column: label })} onClick={() => toggleSort(col.key)}>
                {label}
                {active ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
              </button>
            </span>
          );
        })}
        <span />
      </div>
      {sorted.map((row) => (
        <PerfRowView key={rowKey(row)} row={row} sel={sel} expanded={open.has(rowKey(row))} onToggle={() => toggleRow(rowKey(row))} />
      ))}
    </div>
  );
}
