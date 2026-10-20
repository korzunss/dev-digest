/* Pure view rules for the Agent Stats breakdown panels (spec 016). No React,
   no clock: every date goes through `Intl` in the time zone it is handed, and
   unknown categories / severities are never mapped onto known ones. */
import type {
  AgentStatsBreakdown,
  BreakdownBucket,
  BreakdownBucketKind,
  BreakdownMemoryRow,
  BreakdownSkillRow,
} from "@devdigest/shared/contracts/agent-performance.js";
import { CATEGORY_COLOR, CATEGORY_FALLBACK_COLOR, KNOWN_CATEGORIES } from "@/lib/finding-category";
import { SEVERITY_META } from "@/lib/severity";

/** Share of `count` in `denominator`, 0–100, unrounded (a bar's width). */
export function shareValue(count: number, denominator: number): number {
  if (denominator <= 0 || count <= 0) return 0;
  return Math.min(100, (count / denominator) * 100);
}

/** A whole percent; "<1%" when the share is above 0 but would round to 0. */
export function sharePercent(count: number, denominator: number): string {
  const share = shareValue(count, denominator);
  if (share === 0) return "0%";
  const whole = Math.round(share);
  return whole === 0 ? "<1%" : `${whole}%`;
}

/** AC-6: share descending (same as runs descending for one denominator), then name. */
export function sortSkillRows(rows: readonly BreakdownSkillRow[], denominator: number): BreakdownSkillRow[] {
  return [...rows].sort(
    (a, b) =>
      shareValue(b.runs, denominator) - shareValue(a.runs, denominator) || a.name.localeCompare(b.name),
  );
}

type Dated = { tracked_since: string | null };

/** AC-8 / AC-18: the tracked-since instant when the period starts before it, else null. */
function noDataBefore(panel: Dated, windowFrom: string): string | null {
  if (!panel.tracked_since) return null;
  return Date.parse(panel.tracked_since) > Date.parse(windowFrom) ? panel.tracked_since : null;
}

export type SkillsView =
  | { kind: "ciOnly" }
  | { kind: "notRecorded" }
  | { kind: "noDenominator"; noDataBefore: string | null }
  | { kind: "noSkills"; noDataBefore: string | null }
  | { kind: "list"; rows: BreakdownSkillRow[]; noDataBefore: string | null };

/** Which state the skills panel is in (AC-6…AC-11); ciOnly beats notRecorded. */
export function skillsView(data: AgentStatsBreakdown): SkillsView {
  const { skills, local_runs, window } = data;
  if (local_runs === 0) return { kind: "ciOnly" };
  if (skills.tracked_since === null) return { kind: "notRecorded" };
  const before = noDataBefore(skills, window.from);
  if (skills.denominator === 0) return { kind: "noDenominator", noDataBefore: before };
  if (skills.rows.length === 0) return { kind: "noSkills", noDataBefore: before };
  return { kind: "list", rows: sortSkillRows(skills.rows, skills.denominator), noDataBefore: before };
}

export type MemoryView =
  | { kind: "ciOnly" }
  | { kind: "none"; noDataBefore: string | null }
  | { kind: "list"; rows: BreakdownMemoryRow[]; noDataBefore: string | null };

/** Which state the memory panel is in (AC-16…AC-19). Rows arrive sorted by runs. */
export function memoryView(data: AgentStatsBreakdown): MemoryView {
  const { memory, local_runs, window } = data;
  if (local_runs === 0) return { kind: "ciOnly" };
  const before = noDataBefore(memory, window.from);
  if (memory.rows.length === 0) return { kind: "none", noDataBefore: before };
  return { kind: "list", rows: memory.rows, noDataBefore: before };
}

export type FindingsView = "ciOnly" | "none" | "charts";

/** Shared by both findings panels (AC-22, AC-23). */
export function findingsView(data: AgentStatsBreakdown): FindingsView {
  if (data.local_runs === 0) return "ciOnly";
  if (data.findings.total === 0) return "none";
  return "charts";
}

// --- dates -----------------------------------------------------------------

interface Parts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

function parts(ms: number, tz: string): Parts {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms))) {
    out[p.type] = p.value;
  }
  return out as unknown as Parts;
}

const dayKey = (p: Parts) => `${p.year}-${p.month}-${p.day}`;

/** "Oct 11" in `tz`. */
export function formatDay(iso: string, tz: string): string {
  const p = parts(Date.parse(iso), tz);
  return `${p.month} ${p.day}`;
}

/** True when the buckets span more than one calendar year in `tz` (month labels then carry it). */
export function crossesYear(buckets: readonly BreakdownBucket[], tz: string): boolean {
  if (buckets.length === 0) return false;
  const first = parts(Date.parse(buckets[0]!.start), tz).year;
  const last = parts(Date.parse(buckets[buckets.length - 1]!.end) - 1, tz).year;
  return first !== last;
}

/** H1…H6, W1…Wn, or the short month ("Oct", "Oct 2026" when the range crosses a year). */
export function bucketLabel(
  kind: BreakdownBucketKind,
  index: number,
  bucket: BreakdownBucket,
  tz: string,
  withYear = false,
): string {
  if (kind === "4h") return `H${index + 1}`;
  if (kind === "7d") return `W${index + 1}`;
  const p = parts(Date.parse(bucket.start), tz);
  return withYear ? `${p.month} ${p.year}` : p.month;
}

/**
 * The bucket's exact range (AC-32). 4 h: "Oct 11 08:00–12:00" (a date on both
 * ends when the days differ); 7 d / month: "Oct 11–Oct 17", the end being the
 * last day inside the bucket.
 */
export function bucketRange(kind: BreakdownBucketKind, bucket: BreakdownBucket, tz: string): string {
  const start = Date.parse(bucket.start);
  const end = Date.parse(bucket.end);
  const s = parts(start, tz);
  const lastInside = parts(Math.max(start, end - 1), tz);
  const sameDay = dayKey(s) === dayKey(lastInside);
  if (kind !== "4h") {
    return sameDay ? `${s.month} ${s.day}` : `${s.month} ${s.day}–${lastInside.month} ${lastInside.day}`;
  }
  const e = parts(end, tz);
  const from = `${s.month} ${s.day} ${s.hour}:${s.minute}`;
  return sameDay ? `${from}–${e.hour}:${e.minute}` : `${from}–${e.month} ${e.day} ${e.hour}:${e.minute}`;
}

// --- legends ---------------------------------------------------------------

export interface CategoryLegendEntry {
  category: string;
  count: number;
  color: string;
  percent: string;
  known: boolean;
}

/** AC-24/25: the five known categories with real counts (0 included), then unknown values as stored. */
export function categoryLegend(
  byCategory: ReadonlyArray<{ category: string; count: number }>,
  total: number,
): CategoryLegendEntry[] {
  const counts = new Map<string, number>();
  for (const { category, count } of byCategory) counts.set(category, (counts.get(category) ?? 0) + count);
  const known: CategoryLegendEntry[] = KNOWN_CATEGORIES.map((category) => {
    const count = counts.get(category) ?? 0;
    return { category, count, color: CATEGORY_COLOR[category]!, percent: sharePercent(count, total), known: true };
  });
  const knownSet = new Set<string>(KNOWN_CATEGORIES);
  const unknown: CategoryLegendEntry[] = [...counts.entries()]
    .filter(([category]) => !knownSet.has(category))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([category, count]) => ({
      category,
      count,
      color: CATEGORY_FALLBACK_COLOR,
      percent: sharePercent(count, total),
      known: false,
    }));
  return [...known, ...unknown];
}

export type SeverityKey = "critical" | "warning" | "suggestion" | "other";

export interface SeverityLegendEntry {
  key: SeverityKey;
  count: number;
  color: string;
}

/** Legend order Critical, Warning, Suggestion; Other only when its count in the period is > 0 (AC-33). */
export function severityLegend(buckets: readonly BreakdownBucket[]): SeverityLegendEntry[] {
  const sum = (key: SeverityKey) => buckets.reduce((n, b) => n + b[key], 0);
  const entries: SeverityLegendEntry[] = [
    { key: "critical", count: sum("critical"), color: SEVERITY_META.CRITICAL.color },
    { key: "warning", count: sum("warning"), color: SEVERITY_META.WARNING.color },
    { key: "suggestion", count: sum("suggestion"), color: SEVERITY_META.SUGGESTION.color },
  ];
  const other = sum("other");
  if (other > 0) entries.push({ key: "other", count: other, color: "var(--text-muted)" });
  return entries;
}

/** All severities of one bucket. */
export function bucketTotal(b: BreakdownBucket): number {
  return b.critical + b.warning + b.suggestion + b.other;
}
