import type { CSSProperties } from "react";

/** Co-located styles for ConventionsHeader. Mirrors the PR list's page header
    so the two repo-scoped screens line up at the same margins. */
export const s = {
  header: {
    padding: "24px 32px 10px",
    display: "flex",
    alignItems: "flex-end",
    gap: 16,
  } satisfies CSSProperties,
  titleWrap: { minWidth: 0 } satisfies CSSProperties,
  title: {
    fontSize: 24,
    fontWeight: 700,
    letterSpacing: "-0.02em",
  } satisfies CSSProperties,
  repo: { color: "var(--text-secondary)" } satisfies CSSProperties,
  meta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    fontSize: 14,
    color: "var(--text-secondary)",
    marginTop: 4,
  } satisfies CSSProperties,
  separator: { color: "var(--text-muted)" } satisfies CSSProperties,
  actions: {
    marginLeft: "auto",
    display: "flex",
    gap: 10,
    alignItems: "center",
  } satisfies CSSProperties,
  dropped: {
    padding: "0 32px 6px",
    fontSize: 13,
    color: "var(--warn)",
  } satisfies CSSProperties,
} as const;
