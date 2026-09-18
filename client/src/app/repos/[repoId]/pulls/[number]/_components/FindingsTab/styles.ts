import type { CSSProperties } from "react";

export const s = {
  reviewInProgress: {
    marginBottom: 18,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  reviewInProgressText: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  reviewInProgressSub: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  lethalTrifecta: {
    marginBottom: 18,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
  } satisfies CSSProperties,
  lethalTrifectaTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--crit)",
  } satisfies CSSProperties,
  liveRunSection: {
    marginBottom: 18,
  } satisfies CSSProperties,
  timelineSection: {
    marginBottom: 18,
  } satisfies CSSProperties,
  cancelActions: {
    display: "flex",
    gap: 8,
  } satisfies CSSProperties,
  /* Active severity filter — one bar for the whole tab, not one per run. */
  filterBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "2px 0 12px",
  } satisfies CSSProperties,
  filterChip: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 6px 3px 10px",
    borderRadius: 999,
    border: `1px solid ${color}`,
    color,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  }),
  filterClear: {
    display: "inline-flex",
    alignItems: "center",
    padding: 2,
    border: "none",
    borderRadius: 999,
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
  } satisfies CSSProperties,
  filterHint: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
