import type { CSSProperties } from "react";

/** Co-located styles for CostBreakdown and CostDonut. */
export const s = {
  section: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  heading: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: 0,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  charts: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 } satisfies CSSProperties,
  card: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  cardTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
  body: { display: "flex", alignItems: "center", gap: 20 } satisfies CSSProperties,
  legend: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0, flex: 1, listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  legendRow: { display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "4px 10px", fontSize: 13 } satisfies CSSProperties,
  legendLabel: {
    color: "var(--text-secondary)",
    // DG1: a floor so a long provenance split can never squeeze the name to zero; the value wraps below instead.
    flex: "1 1 120px",
    minWidth: 120,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  legendValue: { color: "var(--text-primary)", fontWeight: 600, textAlign: "right", flex: "0 1 auto", maxWidth: "100%" } satisfies CSSProperties,
  muted: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
