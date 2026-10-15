import type { CSSProperties } from "react";

/* Copied from `vendor/ui/primitives/Markdown.tsx` (vendor is not edited). */
export const styles = {
  root: { fontSize: "inherit", lineHeight: 1.55 } satisfies CSSProperties,
  p: { margin: "0 0 10px" } satisfies CSSProperties,
  strong: { fontWeight: 650, color: "var(--text-primary)" } satisfies CSSProperties,
  code: {
    fontSize: "0.92em",
    padding: "1px 6px",
    borderRadius: 4,
    background: "var(--bg-hover)",
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  a: { color: "var(--accent-text)", textDecoration: "underline" } satisfies CSSProperties,
} as const;
