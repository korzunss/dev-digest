/* KpiTile — a KPI card: label (+ optional aside such as a ring), a big value, a footer.
   Our own tile rather than the vendored MetricCard, which colours an increase green. */
"use client";

import React from "react";
import { s } from "./styles";

export function KpiTile({
  label,
  aside,
  children,
  footer,
}: {
  label: string;
  /** Top-right slot: a ring or a small chart. */
  aside?: React.ReactNode;
  /** The big value row. */
  children: React.ReactNode;
  /** Below the value: a sparkline, a split line, a note. */
  footer?: React.ReactNode;
}) {
  return (
    <section style={s.tile} aria-label={label}>
      <div style={s.tileHead}>
        <span style={s.tileLabel}>{label}</span>
        {aside}
      </div>
      <div className="tnum" style={s.tileValue}>
        {children}
      </div>
      {footer}
    </section>
  );
}

export default KpiTile;
