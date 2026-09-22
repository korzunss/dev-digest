/* Donut — ring chart with a legend, on Recharts. */
import React from "react";
import { PieChart, Pie, Cell } from "recharts";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  segments,
  size = 130,
  stroke = 22,
  valuePrefix = "$",
  formatValue,
}: {
  segments: DonutSegment[];
  size?: number;
  stroke?: number;
  valuePrefix?: string;
  /**
   * How a legend value is rendered. The default is money (`$1.23`), which is
   * what this chart was built for — but a count of findings rendered as
   * "12.00" is simply wrong, so any non-currency caller passes its own
   * formatter. Supplying it replaces `valuePrefix` and the 2dp entirely.
   */
  formatValue?: (v: number) => string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <PieChart width={size} height={size}>
        <Pie
          data={segments}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius={(size - stroke) / 2 - stroke / 2}
          outerRadius={(size - stroke) / 2 + stroke / 2}
          startAngle={90}
          endAngle={-270}
          isAnimationActive={false}
          stroke="none"
        >
          {segments.map((s, i) => (
            <Cell key={i} fill={s.color} />
          ))}
        </Pie>
      </PieChart>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color }} />
            <span style={{ color: "var(--text-secondary)", flex: 1 }}>{s.label}</span>
            <span className="mono tnum" style={{ color: "var(--text-primary)", fontWeight: 600 }}>
              {formatValue ? formatValue(s.value) : `${valuePrefix}${s.value.toFixed(2)}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
