import type { CSSProperties } from "react";

/** Co-located styles for AgentIdentity. */
export const s = {
  badge: (color: string, size: number): CSSProperties => ({
    display: "inline-grid",
    placeItems: "center",
    flexShrink: 0,
    width: size,
    height: size,
    borderRadius: 6,
    color,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
  }),
};
