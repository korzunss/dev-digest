import type { CSSProperties } from "react";

/** Co-located styles for DocPreview. */
export const s = {
  wrap: { fontSize: 13.5, color: "var(--text-secondary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)", padding: "8px 0" } satisfies CSSProperties,
} as const;
