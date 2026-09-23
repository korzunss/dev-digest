import type { CSSProperties } from "react";
import { RAIL_WIDTH, SHELL_OFFSET } from "./constants";

/** The two-column frame both skills routes render into. Exported beside the
    rail because the rail is the thing that defines the left column's width. */
export const layout = {
  split: { display: "flex", height: `calc(100vh - ${SHELL_OFFSET}px)` } satisfies CSSProperties,
  pane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
  } satisfies CSSProperties,
} as const;

/** Co-located styles for SkillsRail. */
export const s = {
  rail: {
    width: RAIL_WIDTH,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    background: "var(--bg-surface)",
    minHeight: 0,
  } satisfies CSSProperties,
  head: { padding: "16px 14px 10px", display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700, flex: 1, letterSpacing: "-0.01em" } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 11px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
    minWidth: 0,
  } satisfies CSSProperties,
  list: {
    flex: 1,
    overflow: "auto",
    padding: "0 12px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
} as const;
