/* Pure helpers for the CI Runs page: URL filters, the time range, cell text. */
import type { CiRunStatus } from "@devdigest/shared";

/** Time-range choices; the URL carries the key, `since` is derived from it. */
export const RANGES = ["24h", "7d", "30d", "all"] as const;
export type Range = (typeof RANGES)[number];
export const DEFAULT_RANGE: Range = "7d";

/** Closed set, mirrored locally: the client takes no value imports from shared. */
export const STATUSES: readonly CiRunStatus[] = ["passed", "gate_failed", "error"];

const RANGE_MS: Record<Exclude<Range, "all">, number> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

export const RANGE_LABEL_KEY: Record<Range, string> = {
  "24h": "last24Hours",
  "7d": "last7Days",
  "30d": "last30Days",
  all: "allTime",
};

export interface Filters {
  range: Range;
  agent: string;
  repo: string;
  status: CiRunStatus | "";
}

/** Read the filters off the URL; anything unknown falls back to the default. */
export function parseFilters(get: (key: string) => string | null): Filters {
  const range = get("range");
  const status = get("status");
  return {
    range: (RANGES as readonly string[]).includes(range ?? "") ? (range as Range) : DEFAULT_RANGE,
    agent: get("agent") ?? "",
    repo: get("repo") ?? "",
    status: (STATUSES as readonly string[]).includes(status ?? "") ? (status as CiRunStatus) : "",
  };
}

/** `since` (ISO) for a range. "all" is the epoch, never undefined: the server defaults a missing `since` to 7 days. */
export function sinceFor(range: Range, now: number = Date.now()): string {
  return range === "all" ? new Date(0).toISOString() : new Date(now - RANGE_MS[range]).toISOString();
}

export function formatCost(cost: number | null): string {
  return cost === null ? "—" : `$${cost.toFixed(cost < 0.01 && cost > 0 ? 4 : 2)}`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export type StatusTone = "ok" | "warn" | "crit";

export function statusTone(status: CiRunStatus): StatusTone {
  return status === "passed" ? "ok" : status === "gate_failed" ? "warn" : "crit";
}

/** Only an https link is rendered as one; anything else stays inert text. */
export function safeHttpsUrl(url: string | null): string | null {
  return url && /^https:\/\//.test(url) ? url : null;
}
