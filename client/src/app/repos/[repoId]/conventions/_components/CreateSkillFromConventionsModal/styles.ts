import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillFromConventionsModal. */
export const s = {
  // `Modal` hands its children no padding; 24 is what every other modal here
  // supplies, and the vertical rhythm comes from FormField's own margin.
  body: { padding: 24 } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  /** Says where this text came from, so nobody reads it as hand-written. */
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "9px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-secondary)",
    fontSize: 12.5,
    lineHeight: 1.45,
    marginBottom: 18,
  } satisfies CSSProperties,
  bannerIcon: { color: "var(--accent)", flexShrink: 0 } satisfies CSSProperties,
  /** The step control, shown only when `split` produced more than one skill. */
  stepper: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    marginBottom: 18,
  } satisfies CSSProperties,
  step: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  stepHint: {
    marginLeft: "auto",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  /* The strip above the body editor: file chip · token estimate. Square at the
     bottom so it reads as one control with the textarea, which is why all four
     border sides are longhand — mixing a shorthand with one side warns on
     re-render (client/INSIGHTS.md). */
  bodyBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "7px 11px",
    borderStyle: "solid",
    borderWidth: 1,
    borderTopColor: "var(--border)",
    borderRightColor: "var(--border)",
    borderBottomColor: "var(--border)",
    borderLeftColor: "var(--border)",
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  fileChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  fileIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  tokens: {
    marginLeft: "auto",
    fontSize: 12,
    color: "var(--text-muted)",
    cursor: "help",
  } satisfies CSSProperties,
  bodyWrap: { marginTop: -1 } satisfies CSSProperties,
  loadingStack: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  empty: {
    padding: "28px 4px",
    textAlign: "center",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
