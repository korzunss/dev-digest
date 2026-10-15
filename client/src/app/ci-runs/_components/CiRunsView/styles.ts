import type { CSSProperties } from "react";

/** Co-located styles for CiRunsView, CiRunsFilters and CiRunRow. */
const COLUMNS = "150px 70px minmax(150px, 1.5fr) 70px 120px 70px 80px 110px 50px";

export const s = {
  page: { padding: "28px 36px", maxWidth: 1100, display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 16 } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  subtitle: { fontSize: 13.5, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  headerActions: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  auto: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  autoDot: { width: 7, height: 7, borderRadius: "50%", background: "var(--ok)" } satisfies CSSProperties,
  filters: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  banner: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    color: "var(--text)",
    fontSize: 12.5,
  } satisfies CSSProperties,
  table: { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-elevated)", overflow: "hidden" } satisfies CSSProperties,
  headRow: {
    display: "grid",
    gridTemplateColumns: COLUMNS,
    gap: 12,
    padding: "9px 16px",
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  row: {
    display: "grid",
    gridTemplateColumns: COLUMNS,
    alignItems: "center",
    gap: 12,
    padding: "11px 16px",
    borderTop: "1px solid var(--border)",
    fontSize: 13,
  } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  link: { color: "var(--accent)", textDecoration: "none", fontWeight: 600 } satisfies CSSProperties,
  source: { minWidth: 0, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  agentName: { fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  repo: { fontSize: 11.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  deleted: { fontStyle: "italic", color: "var(--text-muted)" } satisfies CSSProperties,
  empty: { padding: "40px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
  emptyTitle: { fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 4 } satisfies CSSProperties,
  more: { display: "flex", justifyContent: "center", padding: 12, borderTop: "1px solid var(--border)" } satisfies CSSProperties,
} as const;

export const TONE = {
  ok: { color: "var(--ok)", bg: "var(--ok-bg)" },
  warn: { color: "var(--warn)", bg: "var(--warn-bg)" },
  crit: { color: "var(--crit)", bg: "var(--crit-bg)" },
} as const;
