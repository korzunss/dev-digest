import type { CSSProperties } from "react";

/** Co-located styles for the skill VersionsTab. */
export const s = {
  wrap: { maxWidth: 860 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 } satisfies CSSProperties,
  title: { fontSize: 17, fontWeight: 700 } satisfies CSSProperties,
  hint: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    lineHeight: 1.5,
    marginBottom: 14,
    maxWidth: 680,
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  /* All four sides longhand: only the colour differs between the current row
     and an older one, and it moves on a mounted node after a restore
     (client/INSIGHTS.md). */
  row: (current: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 7,
    borderStyle: "solid",
    borderWidth: 1,
    borderTopColor: current ? "var(--border-strong)" : "var(--border)",
    borderRightColor: current ? "var(--border-strong)" : "var(--border)",
    borderBottomColor: current ? "var(--border-strong)" : "var(--border)",
    borderLeftColor: current ? "var(--border-strong)" : "var(--border)",
    background: current ? "var(--bg-hover)" : "var(--bg-elevated)",
  }),
  message: { fontSize: 13, flex: 1, minWidth: 0, color: "var(--text-primary)" } satisfies CSSProperties,
  noMessage: { fontSize: 13, flex: 1, minWidth: 0, color: "var(--text-muted)", fontStyle: "italic" } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  onlyOne: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 12 } satisfies CSSProperties,
  diffBody: { padding: "14px 20px" } satisfies CSSProperties,
  diffEmpty: { fontSize: 13, color: "var(--text-muted)", padding: "8px 0" } satisfies CSSProperties,
} as const;
