import type { CSSProperties } from "react";

/** Co-located styles for the perf-kit components. */
export const s = {
  tile: {
    flex: 1,
    minWidth: 0,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  tileHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  } satisfies CSSProperties,
  tileLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  tileValue: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 10,
    fontSize: 32,
    fontWeight: 700,
    letterSpacing: "-0.02em",
  } satisfies CSSProperties,
  muted: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  sparkSlot: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 24,
  } satisfies CSSProperties,
  rate: {
    display: "inline-flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 6,
  } satisfies CSSProperties,
  rateValue: {
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  trendUp: {
    display: "inline-flex",
    color: "var(--ok)",
  } satisfies CSSProperties,
  trendDown: {
    display: "inline-flex",
    color: "var(--crit)",
  } satisfies CSSProperties,
  costWrap: {
    display: "inline-flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
  costSplit: {
    fontSize: 11,
    fontWeight: 400,
    letterSpacing: 0,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  deltaFavourable: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--ok)",
  } satisfies CSSProperties,
  deltaUnfavourable: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--crit)",
  } satisfies CSSProperties,
  deltaNeutral: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 8,
    padding: "48px 24px",
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  emptyTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  emptyBody: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
