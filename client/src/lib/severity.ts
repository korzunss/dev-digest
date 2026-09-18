/* Severity vocabulary — how a finding's level looks, sorts, and reads (spec 002).
   Before this file the same three levels were coloured by three separate tables
   (FindingCard, the trace drawer's FindingsSection) and sorted by a fourth
   (FindingsPanel), which is how a CRITICAL ends up amber in one place only. */
import type { IconName } from "@devdigest/ui";
import type { Severity, SeverityCounts } from "@devdigest/shared";

/** The three levels, in display order — chips render in this order too. */
export const SEVERITY_LEVELS = ["CRITICAL", "WARNING", "SUGGESTION"] as const;

/** Colour + icon + i18n label key (under `prReview.severity`) per level. */
export const SEVERITY_META: Record<Severity, { color: string; icon: IconName; labelKey: string }> = {
  CRITICAL: { color: "var(--crit)", icon: "AlertOctagon", labelKey: "critical" },
  WARNING: { color: "var(--warn)", icon: "AlertTriangle", labelKey: "warning" },
  SUGGESTION: { color: "var(--sugg)", icon: "Lightbulb", labelKey: "suggestion" },
};

/** Which field of `SeverityCounts` a level counts into. */
export const SEVERITY_COUNT_KEY: Record<Severity, keyof SeverityCounts> = {
  CRITICAL: "critical",
  WARNING: "warning",
  SUGGESTION: "suggestion",
};

const FALLBACK_COLOR = "var(--text-muted)";

/**
 * Colour for ANY severity string, not just the three in the contract: findings
 * are rendered from persisted rows, and older ones can carry `INFO` or a level
 * the contract has since dropped. Those render muted rather than crashing.
 */
export function severityColor(severity: string): string {
  if (severity === "INFO") return "var(--info)";
  return SEVERITY_META[severity as Severity]?.color ?? FALLBACK_COLOR;
}

/** Sort weight, lower first. INFO and anything unrecognised sort last. */
export function severityOrder(severity: string): number {
  const i = (SEVERITY_LEVELS as readonly string[]).indexOf(severity);
  if (i >= 0) return i;
  return severity === "INFO" ? SEVERITY_LEVELS.length : SEVERITY_LEVELS.length + 1;
}

/**
 * Read the `?severity=` URL param. Anything that is not one of the three levels
 * — a typo, a stale link, a hand-edited URL — means "no filter", never an error:
 * a bad param must not blank the page.
 */
export function parseSeverityParam(value: string | null | undefined): Severity | null {
  if (!value) return null;
  return (SEVERITY_LEVELS as readonly string[]).includes(value) ? (value as Severity) : null;
}

/** True when every level is zero — "reviewed and clean", distinct from null. */
export function isAllZero(counts: SeverityCounts): boolean {
  return counts.critical === 0 && counts.warning === 0 && counts.suggestion === 0;
}

/**
 * Tally findings by level for one run, client-side (spec 002).
 *
 * The PR detail already holds every finding of every run (`usePrReviews`), so
 * the timeline's chips need no endpoint and no denormalized column — and they
 * follow a dismissal immediately, which a stored count would not. Dismissed
 * findings are skipped here for the same reason the server skips them.
 */
export function tallySeverities(
  findings: { severity: string; dismissed_at?: string | null }[],
): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.dismissed_at) continue;
    const key = SEVERITY_COUNT_KEY[f.severity as Severity];
    if (key) counts[key] += 1;
  }
  return counts;
}
