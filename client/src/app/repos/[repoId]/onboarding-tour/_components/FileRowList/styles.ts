import type { CSSProperties } from "react";

export const s = {
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: 6,
  } satisfies CSSProperties,
  index: {
    minWidth: 20,
    color: "var(--text-tertiary)",
    fontSize: 13,
    fontVariantNumeric: "tabular-nums",
  } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  path: { fontSize: 13, wordBreak: "break-all" } satisfies CSSProperties,
  reason: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  open: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    color: "var(--accent-text)",
    textDecoration: "none",
    flexShrink: 0,
  } satisfies CSSProperties,
} as const;
