import type { CSSProperties } from "react";

/** Co-located styles for the skill ContextTab. */
export const s = {
  wrap: { maxWidth: 860 } satisfies CSSProperties,
  /* The "serializes as" box. */
  box: {
    marginTop: 20,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  boxLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.07em",
    color: "var(--text-muted)",
    marginBottom: 10,
  } satisfies CSSProperties,
  code: { display: "flex", flexDirection: "column", gap: 3, fontSize: 12.5 } satisfies CSSProperties,
  heading: { color: "var(--text-primary)", fontWeight: 600 } satisfies CSSProperties,
  codeRow: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  path: { color: "var(--text-secondary)" } satisfies CSSProperties,
  marker: { color: "var(--text-muted)", opacity: 0.8 } satisfies CSSProperties,
  boxEmpty: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
