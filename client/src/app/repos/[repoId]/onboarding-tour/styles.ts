import type { CSSProperties } from "react";

/** Co-located styles for the Onboarding Tour page shell. */
export const s = {
  body: { padding: "10px 32px 24px" } satisfies CSSProperties,
  loadingStack: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  columns: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 200px",
    gap: 28,
    alignItems: "start",
  } satisfies CSSProperties,
  sections: { display: "flex", flexDirection: "column", gap: 14, minWidth: 0 } satisfies CSSProperties,
  note: { margin: 0, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  aside: { position: "sticky", top: 16 } satisfies CSSProperties,
} as const;
