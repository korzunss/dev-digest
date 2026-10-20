/* SafeSparkline — the vendored Sparkline divides by (length - 1), so one point is NaN.
   ≥ 2 points → the line; 1 → a dot; 0 → nothing. Always carries a text label.
   `w` is a maximum: the line shrinks to the slot's measured width, so a narrow tile never
   lets the fixed-width SVG run past its edge. */
"use client";

import React, { useEffect, useRef, useState } from "react";
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
  const slot = useRef<HTMLSpanElement>(null);
  const [avail, setAvail] = useState(0);
  useEffect(() => {
    const el = slot.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setAvail(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const points = data.filter((n) => Number.isFinite(n));
  if (points.length === 0) return null;
  const stroke = color ?? "var(--accent)";
  // The vendored line puts its end dot (r = 2) on x = width, so keep 2px for it.
  const width = avail > 0 ? Math.max(Math.min(w, avail) - 2, 1) : w;
  return (
    <span ref={slot} role="img" aria-label={label} title={label} style={{ ...s.sparkSlot, maxWidth: w }}>
      {points.length === 1 ? (
        <svg width={width} height={h} aria-hidden="true">
          <circle cx={width / 2} cy={h / 2} r={3} fill={stroke} />
        </svg>
      ) : (
        <Sparkline data={points} w={width} h={h} color={stroke} />
      )}
    </span>
  );
}

export default SafeSparkline;
