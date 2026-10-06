import type { RiskSeverity } from "@devdigest/shared";
import { Icon } from "@devdigest/ui";

/** Severity is told apart by icon shape (plus an aria-label), not colour alone. */
export const SEVERITY_ICON = {
  high: { icon: Icon.AlertOctagon, color: "var(--crit)" },
  medium: { icon: Icon.AlertTriangle, color: "var(--warn)" },
  low: { icon: Icon.Info, color: "var(--text-muted)" },
} as const satisfies Record<RiskSeverity, { icon: unknown; color: string }>;
