import type { CSSProperties } from "react";

export const s = {
  wrap: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    marginBottom: 12,
    // "clip", not "hidden": `hidden` turns this wrapper into a scroll
    // container, which makes `position: sticky` on the header inert (S25).
    // `clip` still clips the rounded corners.
    overflow: "clip",
  } satisfies CSSProperties,
  header: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "11px 14px",
    // Sticky under the PR detail header (D17-A′): its published height, or
    // 0 before it has measured. zIndex 2 stays below PrDetailHeader's 5 and
    // above the InlineFinding × (1).
    position: "sticky",
    top: "var(--pr-header-h, 0px)",
    zIndex: 2,
    background: "var(--bg-surface)",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    font: "inherit",
    color: "inherit",
  } satisfies CSSProperties,
  chevron: { color: "var(--text-muted)" } satisfies CSSProperties,
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
    flexShrink: 0,
  } satisfies CSSProperties,
  label: {
    fontWeight: 600,
    fontSize: 13,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  hint: {
    fontSize: 12,
    color: "var(--text-muted)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  spacer: { flex: 1, minWidth: 8 } satisfies CSSProperties,
  findingCount: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--crit)",
    flexShrink: 0,
  } satisfies CSSProperties,
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "var(--crit)",
  } satisfies CSSProperties,
  filesCount: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  body: {
    borderTop: "1px solid var(--border)",
    padding: "12px 14px 14px",
  } satisfies CSSProperties,
} as const;
