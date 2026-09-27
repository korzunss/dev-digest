import type { CSSProperties } from "react";

export const s = {
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  summary: {
    textTransform: "none",
    fontWeight: 400,
    marginLeft: 8,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  loading: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "8px 0",
  } satisfies CSSProperties,
  unavailable: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "8px 0",
  } satisfies CSSProperties,
  reviewNotRun: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "8px 0",
  } satisfies CSSProperties,
} as const;
