import type { CSSProperties } from "react";

/** Co-located styles for ContextDocList. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  toolbar: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  count: { fontSize: 12.5, color: "var(--text-muted)", flex: 1 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  /* All four sides longhand: only the colour changes on selection, on a mounted node. */
  row: (selected: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    textAlign: "left",
    padding: "8px 10px",
    borderRadius: 7,
    borderStyle: "solid",
    borderWidth: 1,
    borderTopColor: selected ? "var(--border-strong)" : "var(--border)",
    borderRightColor: selected ? "var(--border-strong)" : "var(--border)",
    borderBottomColor: selected ? "var(--border-strong)" : "var(--border)",
    borderLeftColor: selected ? "var(--border-strong)" : "var(--border)",
    background: selected ? "var(--bg-hover)" : "var(--bg-elevated)",
    color: "var(--text-primary)",
    cursor: "pointer",
  }),
  path: { fontSize: 12.5, flex: 1, minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  note: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
