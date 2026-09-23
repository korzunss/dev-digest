import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillModal. */
export const s = {
  // `Modal` hands its children no padding — every modal here supplies its own,
  // and 24 is what the agent create form uses. The vertical rhythm comes from
  // FormField's own marginBottom rather than from a flex gap stacked on top of
  // it, which is what made this form sit flush and spaced unlike every other.
  body: { padding: 24 } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
