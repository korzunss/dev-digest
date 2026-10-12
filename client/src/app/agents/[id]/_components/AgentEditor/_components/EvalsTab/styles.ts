import type { CSSProperties } from "react";

/** Co-located styles for EvalsTab and CaseRow. */
export const s = {
  wrap: { maxWidth: 960, display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  sectionHead: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  sectionLabel: { fontSize: 11.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" } satisfies CSSProperties,
  sectionIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  dashLink: { fontSize: 12.5, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" } satisfies CSSProperties,
  sectionTitle: { fontSize: 15, fontWeight: 700 } satisfies CSSProperties,
  pill: { fontSize: 12, fontWeight: 600, color: "var(--ok)", background: "var(--ok-bg)", padding: "2px 8px", borderRadius: 4 } satisfies CSSProperties,
  caption: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  tiles: { display: "flex", gap: 12 } satisfies CSSProperties,
  stat: { flex: 1, minWidth: 0, padding: "14px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)" } satisfies CSSProperties,
  statLabel: { fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" } satisfies CSSProperties,
  statBody: { display: "flex", alignItems: "baseline", gap: 8, marginTop: 10 } satisfies CSSProperties,
  statValue: { fontSize: 26, fontWeight: 600, lineHeight: 1.1 } satisfies CSSProperties,
  statDelta: { fontSize: 12.5, fontWeight: 600 } satisfies CSSProperties,
  toolbar: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  progress: { fontSize: 13, color: "var(--accent)", fontWeight: 600 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "18px 0" } satisfies CSSProperties,
} as const;
