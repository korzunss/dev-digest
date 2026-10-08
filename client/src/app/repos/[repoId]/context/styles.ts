import type { CSSProperties } from "react";

/** Co-located styles for the Project Context page shell. */
export const s = {
  header: { padding: "24px 32px 10px" } satisfies CSSProperties,
  title: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repo: { color: "var(--text-secondary)" } satisfies CSSProperties,
  subtitle: {
    fontSize: 14,
    color: "var(--text-secondary)",
    marginTop: 4,
  } satisfies CSSProperties,
  body: { padding: "10px 32px 24px" } satisfies CSSProperties,
  columns: {
    display: "grid",
    gridTemplateColumns: "minmax(280px, 380px) minmax(0, 1fr)",
    gap: 20,
    alignItems: "start",
  } satisfies CSSProperties,
  loadingStack: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  detail: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    minWidth: 0,
  } satisfies CSSProperties,
  detailHead: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  detailPath: {
    fontSize: 13,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  detailBody: { padding: "14px 18px" } satisfies CSSProperties,
  placeholder: {
    padding: "28px 18px",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  roots: { marginTop: 24, maxWidth: 860 } satisfies CSSProperties,
  footer: { padding: "0 32px 44px" } satisfies CSSProperties,
} as const;
