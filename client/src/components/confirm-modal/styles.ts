import type { CSSProperties } from "react";

/** Co-located styles for ConfirmModal. Padding matches the other modals —
    the Modal primitive hands its children none, so each one supplies it. */
export const s = {
  body: {
    padding: 24,
    fontSize: 14,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  footer: { display: "flex", gap: 8, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
