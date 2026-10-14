import type { CSSProperties } from "react";

/** Co-located styles for the skill EvalsTab. */
export const s = {
  wrap: { maxWidth: 960, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  toolbar: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  title: { fontSize: 15, fontWeight: 700 } satisfies CSSProperties,
  pill: { fontSize: 12, fontWeight: 600, color: "var(--ok)", background: "var(--ok-bg)", padding: "2px 8px", borderRadius: 4 } satisfies CSSProperties,
  progress: { fontSize: 13, color: "var(--accent)", fontWeight: 600 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  note: { fontSize: 12.5, color: "var(--warn)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "18px 0" } satisfies CSSProperties,
  pickerSlot: { marginTop: 12, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;
