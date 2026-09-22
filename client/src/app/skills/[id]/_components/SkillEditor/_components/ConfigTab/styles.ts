import type { CSSProperties } from "react";

/** Co-located styles for the skill ConfigTab. */
export const s = {
  wrap: { maxWidth: 820 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  enabledLabel: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  notice: {
    display: "flex",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    borderStyle: "solid",
    borderWidth: 1,
    borderTopColor: "var(--warn)",
    borderRightColor: "var(--warn)",
    borderBottomColor: "var(--warn)",
    borderLeftColor: "var(--warn)",
    background: "var(--warn-bg)",
    color: "var(--text-secondary)",
    fontSize: 12.5,
    lineHeight: 1.5,
    marginBottom: 16,
  } satisfies CSSProperties,
  noticeIcon: { color: "var(--warn)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  /* The strip above the body textarea: file chip · unsaved · token estimate.
     Its bottom corners are square so it reads as one control with the
     textarea beneath it, which is why all four border sides are longhand —
     mixing `borderColor` with a single-side override warns on re-render. */
  bodyBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "7px 11px",
    borderStyle: "solid",
    borderWidth: 1,
    borderTopColor: "var(--border)",
    borderRightColor: "var(--border)",
    borderBottomColor: "var(--border)",
    borderLeftColor: "var(--border)",
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  fileChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  fileIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-muted)", cursor: "help" } satisfies CSSProperties,
  bodyWrap: { marginTop: -1 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, marginTop: 16 } satisfies CSSProperties,
  savedNote: { fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
  actionsRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  /** Predictive, so it sits opposite the button it describes. */
  snapshotNote: {
    marginLeft: "auto",
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  snapshotVersion: {
    color: "var(--text-secondary)",
    fontWeight: 600,
  } satisfies CSSProperties,
  /** Destructive actions live below a rule, not beside Save. */
  dangerZone: {
    marginTop: 28,
    paddingTop: 20,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    borderTopColor: "var(--border)",
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
  } satisfies CSSProperties,
  dangerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  dangerTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--crit)",
    marginBottom: 4,
  } satisfies CSSProperties,
  dangerBody: {
    fontSize: 13,
    color: "var(--text-muted)",
    lineHeight: 1.45,
  } satisfies CSSProperties,
} as const;
