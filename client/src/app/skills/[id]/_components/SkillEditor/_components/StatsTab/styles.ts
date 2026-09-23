import type { CSSProperties } from "react";

/** Co-located styles for the skill StatsTab. */
export const s = {
  wrap: { maxWidth: 900 } satisfies CSSProperties,
  tiles: { display: "flex", gap: 14, flexWrap: "wrap" } satisfies CSSProperties,
  tile: { flex: "1 1 180px", minWidth: 180, display: "flex" } satisfies CSSProperties,
  /* Not decoration: these figures are measured over runs where the skill was
     present, which is correlation. The line says so, right under the numbers
     it qualifies. */
  caveat: {
    marginTop: 14,
    fontSize: 12.5,
    lineHeight: 1.6,
    color: "var(--text-muted)",
    maxWidth: 720,
  } satisfies CSSProperties,
  panels: { display: "flex", gap: 16, marginTop: 26, flexWrap: "wrap" } satisfies CSSProperties,
  panel: {
    flex: "1 1 320px",
    minWidth: 300,
    padding: "16px 18px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  agentList: { display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: 7,
    textDecoration: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  agentName: { fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 } satisfies CSSProperties,
  agentOpen: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  panelEmpty: { fontSize: 12.5, color: "var(--text-muted)", padding: "8px 0" } satisfies CSSProperties,
} as const;
