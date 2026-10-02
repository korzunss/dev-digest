import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
  } satisfies CSSProperties,
  muted: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  row: {
    display: "flex",
    gap: 10,
    alignItems: "baseline",
    flexWrap: "wrap",
    fontSize: 13,
    color: "var(--text-secondary)",
    padding: "4px 0",
  } satisfies CSSProperties,
  link: {
    color: "var(--accent)",
    textDecoration: "none",
    fontWeight: 600,
  } satisfies CSSProperties,
  title: {
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  meta: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  errorLine: {
    fontSize: 12,
    color: "var(--crit)",
  } satisfies CSSProperties,
} as const;
