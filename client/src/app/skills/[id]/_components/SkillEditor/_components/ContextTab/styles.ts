import type { CSSProperties } from "react";

/** Co-located styles for the skill ContextTab. */
export const s = {
  wrap: { maxWidth: 860 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 } satisfies CSSProperties,
  title: { fontSize: 17, fontWeight: 700 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  filter: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 11px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    width: 200,
  } satisfies CSSProperties,
  filterInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
    minWidth: 0,
  } satisfies CSSProperties,
  hint: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    lineHeight: 1.5,
    marginBottom: 14,
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  /* All four border sides longhand: only the COLOUR differs between attached
     and unattached, and it changes on a mounted node when a checkbox is
     ticked — the exact case where mixing `borderColor` with a single-side
     override warns (client/INSIGHTS.md). */
  row: (attached: boolean, dragging: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 12px",
    borderRadius: 7,
    borderStyle: "solid",
    borderWidth: 1,
    borderTopColor: attached ? "var(--border-strong)" : "var(--border)",
    borderRightColor: attached ? "var(--border-strong)" : "var(--border)",
    borderBottomColor: attached ? "var(--border-strong)" : "var(--border)",
    borderLeftColor: attached ? "var(--border-strong)" : "var(--border)",
    background: attached ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: dragging ? 0.5 : 1,
  }),
  handle: (enabled: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    background: "none",
    border: "none",
    padding: 2,
    color: enabled ? "var(--text-muted)" : "var(--border)",
    cursor: enabled ? "grab" : "default",
  }),
  name: { fontSize: 13, fontWeight: 600, minWidth: 0 } satisfies CSSProperties,
  folder: { fontSize: 12, color: "var(--text-muted)", flex: 1, minWidth: 0 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "16px 0" } satisfies CSSProperties,

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
  previewBody: { padding: "16px 24px" } satisfies CSSProperties,
  previewPre: {
    margin: 0,
    fontSize: 12.5,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
