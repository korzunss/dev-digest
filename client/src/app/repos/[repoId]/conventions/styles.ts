import type { CSSProperties } from "react";

/** Co-located styles for the Conventions page shell. */
export const s = {
  banner: {
    margin: "0 32px 12px",
    padding: "10px 14px",
    borderRadius: 7,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 13,
  } satisfies CSSProperties,
  body: { padding: "0 32px 44px" } satisfies CSSProperties,
  loadingStack: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
} as const;
