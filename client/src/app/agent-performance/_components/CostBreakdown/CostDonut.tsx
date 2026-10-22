/* CostDonut — one cost chart: a recharts ring plus a legend that carries each segment's
   provenance (AC-17a). Drawn here rather than with the vendored Donut, whose legend can
   only print a number. */
"use client";

import React from "react";
import { PieChart, Pie, Cell } from "recharts";
import type { PerfSegment } from "@devdigest/shared/contracts/agent-performance.js";
import { CostAmount } from "@/components/perf-kit";
import { s } from "./styles";

const PALETTE = ["#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b"];
const SIZE = 130;
const STROKE = 22;

/** More than one M-4 provenance among the segments → each legend row prints its split. */
function mixedProvenance(segments: PerfSegment[]): boolean {
  const kinds = new Set<string>();
  for (const seg of segments) {
    if (seg.split.api_usd > 0) kinds.add("api");
    if (seg.split.estimate_usd > 0) kinds.add("estimate");
    if (seg.split.unrecorded_usd > 0) kinds.add("unrecorded");
  }
  return kinds.size > 1;
}

/** DG5: largest first, ties by label; the null-label segment (Deleted agents / Unknown model) last. */
function sortSegments(segments: PerfSegment[]): PerfSegment[] {
  return [...segments].sort((a, b) => {
    if ((a.label == null) !== (b.label == null)) return a.label == null ? 1 : -1;
    return b.amount_usd - a.amount_usd || (a.label ?? "").localeCompare(b.label ?? "");
  });
}

export function CostDonut({
  segments: unsorted,
  nullLabel,
  label,
}: {
  segments: PerfSegment[];
  /** The legend text of a segment whose `label` is null (Deleted agents / Unknown model). */
  nullLabel: string;
  /** Accessible name of the chart; the legend is its text equivalent. */
  label: string;
}) {
  const segments = sortSegments(unsorted);
  const showSplit = mixedProvenance(segments);
  const data = segments.map((seg) => ({ name: seg.label ?? nullLabel, value: seg.amount_usd }));
  return (
    <div style={s.body}>
      <div role="img" aria-label={label} style={{ flexShrink: 0 }}>
        <PieChart width={SIZE} height={SIZE}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={(SIZE - STROKE) / 2 - STROKE / 2}
            outerRadius={(SIZE - STROKE) / 2 + STROKE / 2}
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
            stroke="none"
          >
            {segments.map((seg, i) => (
              <Cell key={seg.key} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
        </PieChart>
      </div>
      <ul style={s.legend}>
        {segments.map((seg, i) => {
          const text = seg.label ?? nullLabel;
          return (
            <li key={seg.key} style={s.legendRow}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: PALETTE[i % PALETTE.length], marginTop: 4, flexShrink: 0 }} />
              <span style={s.legendLabel} title={text}>
                {text}
              </span>
              <span className="mono tnum" style={s.legendValue}>
                <CostAmount value={seg.amount_usd} split={seg.split} showSplit={showSplit} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
