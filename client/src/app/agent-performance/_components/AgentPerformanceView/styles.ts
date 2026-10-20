import type { CSSProperties } from "react";

/** Co-located styles for AgentPerformanceView and its tiles. */
export const s = {
  page: { padding: "28px 36px", maxWidth: 1100, display: "flex", flexDirection: "column", gap: 22 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 16 } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 13.5, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  tiles: { display: "flex", gap: 14, alignItems: "stretch", flexWrap: "wrap" } satisfies CSSProperties,
  skeletonTiles: { display: "flex", gap: 14 } satisfies CSSProperties,
  skeletonStack: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  caption: { fontSize: 12, fontWeight: 400, letterSpacing: 0, color: "var(--text-muted)" } satisfies CSSProperties,
  footerStack: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  mostActive: { display: "flex", flexDirection: "column", gap: 4, fontSize: 14, fontWeight: 400, letterSpacing: 0 } satisfies CSSProperties,
  mostActiveName: {
    fontSize: 15,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  noAgents: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 8,
    padding: "48px 24px",
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  noAgentsTitle: { fontSize: 16, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  noAgentsBody: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  link: { color: "var(--accent)", fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
} as const;
