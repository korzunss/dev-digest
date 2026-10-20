/* SafeSparkline — the vendored Sparkline divides by (length - 1), so one point is NaN.
   ≥ 2 points → the line; 1 → a dot; 0 → nothing. Always carries a text label. */
"use client";

import React from "react";
import { Sparkline } from "@devdigest/ui";
import { s } from "./styles";

export function SafeSparkline({
  data,
  label,
  w = 120,
  h = 28,
  color,
}: {
  data: number[];
  /** Text equivalent for assistive tech. */
  label: string;
  w?: number;
  h?: number;
  color?: string;
}) {
  const points = data.filter((n) => Number.isFinite(n));
  if (points.length === 0) return null;
  const stroke = color ?? "var(--accent)";
  return (
    <span role="img" aria-label={label} title={label} style={s.sparkSlot}>
      {points.length === 1 ? (
        <svg width={w} height={h} aria-hidden="true">
          <circle cx={w / 2} cy={h / 2} r={3} fill={stroke} />
        </svg>
      ) : (
        <Sparkline data={points} w={w} h={h} color={stroke} />
      )}
    </span>
  );
}

export default SafeSparkline;
