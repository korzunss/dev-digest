import type { CSSProperties } from "react";

/** Co-located styles for StatsTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 20, maxWidth: 1100 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 } satisfies CSSProperties,
  tiles: { display: "flex", gap: 14, alignItems: "stretch", flexWrap: "wrap" } satisfies CSSProperties,
  skeletonTiles: { display: "flex", gap: 14 } satisfies CSSProperties,
  skeletonStack: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  caption: { fontSize: 12, fontWeight: 400, letterSpacing: 0, color: "var(--text-muted)" } satisfies CSSProperties,
  footerStack: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
} as const;
