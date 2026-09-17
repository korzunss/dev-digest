import type { CSSProperties } from "react";

/** Co-located styles for RunCostBadge. */
export const s = {
  cell: (known: boolean): CSSProperties => ({
    fontSize: 13,
    color: known ? "var(--text-secondary)" : "var(--text-muted)",
  }),
  inline: {
    fontSize: 11,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
