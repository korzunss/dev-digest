import type { CSSProperties } from "react";

/** Co-located styles for FindingsPreview. */
export const s = {
  trigger: { display: "inline-flex", alignItems: "center" } satisfies CSSProperties,
  card: (top: number, left: number): CSSProperties => ({
    position: "fixed",
    top,
    left,
    zIndex: 60,
    width: 400,
    maxHeight: 360,
    overflow: "hidden",
    padding: "10px 0 4px",
    borderRadius: 10,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    boxShadow: "0 12px 32px rgba(0,0,0,.45)",
    // A hover surface must never eat the pointer: moving toward it is fine,
    // but it sits under the cursor's path and would otherwise block clicks.
    pointerEvents: "none",
  }),
  header: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "0 14px 8px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  item: (first: boolean): CSSProperties => ({
    padding: "10px 14px",
    borderTop: first ? "none" : "1px solid var(--border)",
  }),
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  } satisfies CSSProperties,
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 5,
  } satisfies CSSProperties,
  rationale: {
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } as CSSProperties,
  more: {
    padding: "8px 14px 6px",
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  loading: {
    padding: "4px 14px 10px",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
