/* Role display metadata for the Smart order grouping (spec 007, D10).
   Colours reuse existing CSS vars only — no new palette. `docs` and
   `boilerplate` start collapsed; the other three start open. */
import type { SmartDiffRole } from "@devdigest/shared";

export interface RoleMeta {
  labelKey: string;
  hintKey: string;
  color: string;
  defaultOpen: boolean;
}

export const ROLE_META: Record<SmartDiffRole, RoleMeta> = {
  core: { labelKey: "coreLabel", hintKey: "coreHint", color: "var(--accent)", defaultOpen: true },
  tests: { labelKey: "testsLabel", hintKey: "testsHint", color: "var(--ok)", defaultOpen: true },
  wiring: { labelKey: "wiringLabel", hintKey: "wiringHint", color: "var(--warn)", defaultOpen: true },
  docs: { labelKey: "docsLabel", hintKey: "docsHint", color: "var(--text-muted)", defaultOpen: false },
  boilerplate: {
    labelKey: "boilerplateLabel",
    hintKey: "boilerplateHint",
    color: "var(--border-strong)",
    defaultOpen: false,
  },
};
