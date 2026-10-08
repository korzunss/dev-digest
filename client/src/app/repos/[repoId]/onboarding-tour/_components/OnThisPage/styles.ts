import type { CSSProperties } from "react";

export const s = {
  nav: { fontSize: 13 } satisfies CSSProperties,
  heading: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
  link: {
    display: "block",
    padding: "4px 10px",
    color: "var(--text-secondary)",
    textDecoration: "none",
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: "transparent",
  } satisfies CSSProperties,
  linkActive: {
    display: "block",
    padding: "4px 10px",
    color: "var(--text-primary)",
    fontWeight: 600,
    textDecoration: "none",
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    borderLeftColor: "var(--accent)",
  } satisfies CSSProperties,
} as const;
