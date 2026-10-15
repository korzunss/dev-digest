import type { CSSProperties } from "react";

/** Co-located styles for the Configure run agent list. */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: (checked: boolean, color: string): CSSProperties => ({
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    cursor: "pointer",
    minWidth: 0,
    border: `1px solid ${checked ? color : "var(--border)"}`,
    background: checked ? `color-mix(in srgb, ${color} 8%, var(--bg-surface))` : "var(--bg-surface)",
  }),
  box: (checked: boolean, color: string): CSSProperties => ({
    display: "inline-grid",
    placeItems: "center",
    flexShrink: 0,
    width: 18,
    height: 18,
    marginTop: 7,
    padding: 0,
    borderRadius: 4,
    cursor: "pointer",
    color: "var(--bg-primary)",
    border: `1px solid ${checked ? color : "var(--border-strong)"}`,
    background: checked ? color : "transparent",
  }),
  text: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  verdict: {
    fontSize: 12.5,
    lineHeight: 1.4,
    color: "var(--text-muted)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  estimate: {
    flexShrink: 0,
    fontSize: 12,
    fontFamily: "var(--font-mono, monospace)",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
};
