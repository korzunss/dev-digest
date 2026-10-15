import type { CSSProperties } from "react";

/** Co-located styles for "Where agents disagree". */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } satisfies CSSProperties,
  title: {
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono, monospace)",
  } satisfies CSSProperties,
  toggleLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  group: {
    borderTop: "1px solid var(--border)",
    borderRight: "1px solid var(--border)",
    borderBottom: "1px solid var(--border)",
    borderLeft: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  groupHead: {
    display: "flex",
    alignItems: "baseline",
    gap: 12,
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  loc: { fontSize: 12.5, fontFamily: "var(--font-mono, monospace)", color: "var(--text-secondary)" } satisfies CSSProperties,
  groupTitle: { fontSize: 13.5, fontWeight: 600, overflowWrap: "anywhere" } satisfies CSSProperties,
  takes: {
    display: "grid",
    gridAutoFlow: "column",
    gridAutoColumns: "minmax(160px, 1fr)",
    overflowX: "auto",
  } satisfies CSSProperties,
  take: {
    padding: "10px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 0,
    borderRight: "1px solid var(--border)",
  } satisfies CSSProperties,
  agent: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  verdict: (color: string) =>
    ({
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontSize: 11.5,
      fontWeight: 700,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color,
    }) satisfies CSSProperties,
  dot: (color: string) =>
    ({ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }) satisfies CSSProperties,
  takeTitle: { fontSize: 12, color: "var(--text-muted)", overflowWrap: "anywhere" } satisfies CSSProperties,
};
