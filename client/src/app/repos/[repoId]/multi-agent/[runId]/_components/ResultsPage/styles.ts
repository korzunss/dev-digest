import type { CSSProperties } from "react";

/** Co-located styles for the results screen. */
export const s = {
  page: { padding: "20px 32px", display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  loading: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
};
