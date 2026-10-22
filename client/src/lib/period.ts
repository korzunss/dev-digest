/* period.ts — the period selection shared by the Agent Performance dashboard and
   the agent Stats tab (spec 015, AC-1…AC-4). Lives in `src/lib` because three
   routes use it. Pure functions only: no React, no clock reads except through
   the `now` / `today` arguments (a query key must never hold `Date.now()`). */
import type { PerfQuery } from "@devdigest/shared/contracts/agent-performance.js";

export type PeriodKind = "1d" | "30d" | "custom";

/** What the URL holds: a kind plus, for `custom`, inclusive `YYYY-MM-DD` dates. */
export interface PeriodSel {
  period: PeriodKind;
  from?: string;
  to?: string;
}

export type CustomError = "future" | "order" | "tooLong";

export const THIRTY_DAYS: PeriodSel = { period: "30d" };

/** AC-4: a custom range is at most this many inclusive days. */
export const MAX_CUSTOM_DAYS = 365;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The browser's IANA time zone (AC-1: a custom range is read in it). */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Parse `YYYY-MM-DD` to its parts; null when malformed or not a real calendar date. */
function parseDate(value: string | null | undefined): [number, number, number] | null {
  const m = DATE_RE.exec(value ?? "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return [y, mo, d];
}

/** Local calendar day of `now` as `YYYY-MM-DD`. */
export function localToday(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Inclusive day count between two valid dates (same day = 1). */
function inclusiveDays(from: [number, number, number], to: [number, number, number]): number {
  const a = Date.UTC(from[0], from[1] - 1, from[2]);
  const b = Date.UTC(to[0], to[1] - 1, to[2]);
  return Math.round((b - a) / DAY_MS) + 1;
}

/**
 * AC-4. `today` is the browser-local date. Returns the first problem or null.
 * A malformed or missing date counts as an `order` problem (there is no range).
 */
export function validateCustom(from: string, to: string, today: string): CustomError | null {
  const f = parseDate(from);
  const t = parseDate(to);
  if (!f || !t) return "order";
  if (from > to) return "order";
  if (to > today) return "future";
  if (inclusiveDays(f, t) > MAX_CUSTOM_DAYS) return "tooLong";
  return null;
}

/** Anything with `get(name)`: `URLSearchParams` and Next's `ReadonlyURLSearchParams`. */
export interface SearchLike {
  get(name: string): string | null;
}

/**
 * Read the period from the URL. Missing → 30 days (AC-2). A malformed value, or
 * a custom range that breaks AC-4, also falls back to 30 days (assumption: a
 * hand-edited link must not break the screen).
 */
export function parsePeriod(sp: SearchLike, today: string = localToday()): PeriodSel {
  const kind = sp.get("period");
  if (kind === "1d") return { period: "1d" };
  if (kind === "custom") {
    const from = sp.get("from") ?? "";
    const to = sp.get("to") ?? "";
    return validateCustom(from, to, today) === null ? { period: "custom", from, to } : THIRTY_DAYS;
  }
  return THIRTY_DAYS;
}

/** A stable string for a selection: part of every query key. */
export function periodKey(sel: PeriodSel): string {
  return sel.period === "custom" ? `custom:${sel.from ?? ""}:${sel.to ?? ""}` : sel.period;
}

/** URL pairs for the selection (TQ2): `period=…` plus `from`/`to` for custom. */
export function toSearch(sel: PeriodSel): URLSearchParams {
  const sp = new URLSearchParams({ period: sel.period });
  if (sel.period === "custom") {
    sp.set("from", sel.from ?? "");
    sp.set("to", sel.to ?? "");
  }
  return sp;
}

/**
 * The query the API takes (TQ2): ISO instants plus the IANA zone. The server
 * re-checks AC-4. Custom `from` is the local midnight that starts the first
 * day; `to` is the local midnight after the last day, capped at `now` so a
 * range ending today never reaches into the future.
 */
export function resolveWindow(sel: PeriodSel, now: Date, tz: string): PerfQuery {
  if (sel.period === "1d") {
    return { period: "1d", from: new Date(now.getTime() - DAY_MS).toISOString(), to: now.toISOString(), tz };
  }
  if (sel.period === "30d") {
    return { period: "30d", from: new Date(now.getTime() - 30 * DAY_MS).toISOString(), to: now.toISOString(), tz };
  }
  const f = parseDate(sel.from);
  const t = parseDate(sel.to);
  if (!f || !t) {
    // Unreachable through parsePeriod/PeriodControl; fall back rather than throw in a query function.
    return resolveWindow(THIRTY_DAYS, now, tz);
  }
  const start = new Date(f[0], f[1] - 1, f[2]);
  const after = new Date(t[0], t[1] - 1, t[2] + 1);
  const end = after.getTime() > now.getTime() ? now : after;
  return { period: "custom", from: start.toISOString(), to: end.toISOString(), tz };
}
