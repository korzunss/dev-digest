/* MetricDelta — one compared value: old → new with a signed delta. */
import React from "react";
import { Icon } from "@devdigest/ui";
import { deltaDir } from "./helpers";
import { s } from "./styles";

const COLOR = { up: "var(--ok)", down: "var(--crit)", flat: "var(--text-muted)" } as const;

export function MetricDelta({
  label,
  from,
  to,
  delta,
  deltaText,
  tinted = true,
}: {
  label: string;
  from: string;
  to: string;
  /** The raw delta, for direction only. */
  delta: number | null;
  /** The delta as shown, e.g. "4 pts"; null/absent hides the delta. */
  deltaText: string | null;
  /** Colour the delta by direction (metrics); cost stays neutral. */
  tinted?: boolean;
}) {
  const dir = deltaDir(delta);
  const Arrow = dir === "up" ? Icon.ArrowUp : dir === "down" ? Icon.ArrowDown : Icon.Slash;
  return (
    <div style={s.tile}>
      <div style={s.tileLabel}>{label}</div>
      <div style={s.tileRow}>
        <span className="tnum" style={s.from}>
          {from}
        </span>
        <Icon.ArrowRight size={13} style={{ color: "var(--text-muted)" }} />
        <span className="tnum" style={s.to}>
          {to}
        </span>
        {deltaText != null && (
          <span className="tnum" style={{ ...s.delta, color: tinted ? COLOR[dir] : "var(--text-muted)" }}>
            <Arrow size={11} />
            {deltaText}
          </span>
        )}
      </div>
    </div>
  );
}
