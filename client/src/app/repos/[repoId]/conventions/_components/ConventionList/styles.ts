import type { CSSProperties } from "react";

/** Co-located styles for ConventionList. The toolbar sits inside the same
    bordered container as the cards, the way the PR list's filter bar does. */
export const s = {
  wrap: { padding: "0 32px 44px" } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    padding: "12px 0 14px",
    borderBottom: "1px solid var(--border)",
    marginBottom: 14,
  } satisfies CSSProperties,
  count: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  toolbarActions: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
} as const;
