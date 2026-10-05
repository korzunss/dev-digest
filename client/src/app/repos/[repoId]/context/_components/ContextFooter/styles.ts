import type { CSSProperties } from "react";

/** Co-located styles for ContextFooter. */
export const s = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 20,
    paddingTop: 12,
    borderTop: "1px solid var(--border)",
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  separator: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
