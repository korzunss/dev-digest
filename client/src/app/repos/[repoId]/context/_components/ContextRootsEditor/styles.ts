import type { CSSProperties } from "react";

/** Co-located styles for ContextRootsEditor. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.5 } satisfies CSSProperties,
  textarea: {
    width: "100%",
    padding: "9px 11px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    fontSize: 13,
    resize: "vertical",
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 10 } satisfies CSSProperties,
  error: {
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 13,
  } satisfies CSSProperties,
} as const;
