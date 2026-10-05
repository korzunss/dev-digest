import type { CSSProperties } from "react";

export const s = {
  section: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    scrollMarginTop: 16,
  } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
  } satisfies CSSProperties,
  icon: { color: "var(--text-secondary)", display: "inline-flex" } satisfies CSSProperties,
  title: { fontSize: 16, fontWeight: 700, flex: 1, margin: 0 } satisfies CSSProperties,
  toggle: {
    display: "inline-flex",
    background: "transparent",
    border: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    padding: 4,
  } satisfies CSSProperties,
  body: { padding: "0 16px 16px" } satisfies CSSProperties,
} as const;
