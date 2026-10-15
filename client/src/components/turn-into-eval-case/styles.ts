import type { CSSProperties } from "react";

/** Co-located styles for TurnIntoEvalCase. */
export const s = {
  // The disabled button carries a `title` tooltip; a disabled button swallows
  // pointer events in some browsers, so the wrapper owns the hover target.
  wrap: { display: "inline-flex" } satisfies CSSProperties,
} as const;
