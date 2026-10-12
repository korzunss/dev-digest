import type { CSSProperties } from "react";

/** Co-located styles for RunOnEvalsButton. */
export const s = {
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
  body: { padding: "18px 24px", fontSize: 13.5, lineHeight: 1.5 } satisfies CSSProperties,
} as const;
