import type { CSSProperties } from "react";

/** Co-located styles for the "Latest run for #N" link beside step 1. */
export const s = {
  link: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--accent)",
    textDecoration: "none",
  } satisfies CSSProperties,
  status: (color: string, bg: string): CSSProperties => ({
    padding: "1px 8px",
    borderRadius: 999,
    fontSize: 11.5,
    fontWeight: 600,
    color,
    background: bg,
  }),
};
