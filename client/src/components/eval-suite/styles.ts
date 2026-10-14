import type { CSSProperties } from "react";

/** Co-located styles for CaseRow and RunConfirm. */
export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  rowMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  rowName: { fontSize: 13.5, fontWeight: 600, fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  rowSummary: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  rowActions: { display: "flex", gap: 2, flexShrink: 0 } satisfies CSSProperties,
  statusIcon: { display: "inline-flex", width: 20, justifyContent: "center", flexShrink: 0 } satisfies CSSProperties,
  statusDot: { width: 6, height: 6, borderRadius: "50%", background: "var(--text-muted)" } satisfies CSSProperties,
  actionBtn: { border: "none", color: "var(--text-muted)" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 8 } satisfies CSSProperties,
  agentsList: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  agentsUl: { margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  skipped: { color: "var(--warn)", fontSize: 13 } satisfies CSSProperties,
  confirmBody: { padding: "18px 24px", fontSize: 13.5, lineHeight: 1.5 } satisfies CSSProperties,
} as const;
