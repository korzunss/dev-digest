import type { CSSProperties } from "react";

/** Co-located styles for EvalsTab and CaseRow. */
export const s = {
  wrap: { maxWidth: 960, display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  sectionHead: { display: "flex", alignItems: "baseline", gap: 12 } satisfies CSSProperties,
  sectionTitle: { fontSize: 15, fontWeight: 700 } satisfies CSSProperties,
  caption: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  tiles: { display: "flex", gap: 12 } satisfies CSSProperties,
  tile: { flex: 1, minWidth: 0, display: "flex" } satisfies CSSProperties,
  toolbar: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  progress: { fontSize: 13, color: "var(--accent)", fontWeight: 600 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  rowMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  rowName: { fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  rowSummary: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  rowActions: { display: "flex", gap: 6, flexShrink: 0 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "18px 0" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
  confirmBody: { fontSize: 13.5, lineHeight: 1.5 } satisfies CSSProperties,
} as const;
