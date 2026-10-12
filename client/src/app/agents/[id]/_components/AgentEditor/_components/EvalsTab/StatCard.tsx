/* StatCard — one metric tile of the Evals tab: small uppercase label, large
   coloured value, and the change vs the previous run as whole points (▲ 4pt). */
"use client";

import React from "react";
import { s } from "./styles";

export function StatCard({
  label,
  value,
  suffix,
  color,
  delta,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  /** Value colour token; the muted default is for cards with no data. */
  color?: string;
  /** Change vs the previous run, a 0..1 fraction; undefined hides it. */
  delta?: number;
}) {
  const pts = delta == null ? null : Math.round(delta * 100);
  const deltaColor = pts == null || pts === 0 ? "var(--text-muted)" : pts > 0 ? "var(--ok)" : "var(--crit)";
  const arrow = pts == null || pts === 0 ? "" : pts > 0 ? "▲ " : "▼ ";
  return (
    <div style={s.stat}>
      <div style={s.statLabel}>{label}</div>
      <div style={s.statBody}>
        <span style={{ ...s.statValue, color: color ?? "var(--text-primary)" }}>
          {value}
          {suffix}
        </span>
        {pts != null && (
          <span style={{ ...s.statDelta, color: deltaColor }}>
            {arrow}
            {Math.abs(pts)}pt
          </span>
        )}
      </div>
    </div>
  );
}
