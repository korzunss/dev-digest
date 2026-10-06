import type { BriefInput, BriefInputStatus, BriefMissingInput } from "@devdigest/shared";

/** Reason codes the copy knows (blast `DegradedReason`, linked-issue failures,
    `ContextSkipReason`, intent `stale_reason`). Anything else shows no reason. */
export const KNOWN_REASONS = [
  "flag_off",
  "index_failed",
  "index_partial",
  "repo_too_large",
  "no_data",
  "not_found",
  "unreachable",
  "too_large",
  "missing",
  "outside_search_roots",
  "outside_clone",
  "head_moved",
  "description_changed",
] as const;
export type KnownReason = (typeof KNOWN_REASONS)[number];

export interface CoverageRow {
  input: BriefInput;
  status: BriefInputStatus;
  refs: string[];
  reason: KnownReason | null;
  count: number;
}

const isKnown = (code: string | null): code is KnownReason =>
  code !== null && (KNOWN_REASONS as readonly string[]).includes(code);

/** One row per `input + status`, in first-seen order. */
export function groupCoverage(items: BriefMissingInput[]): CoverageRow[] {
  const groups = new Map<string, BriefMissingInput[]>();
  for (const m of items) {
    const key = `${m.input}\u0000${m.status}`;
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }
  const rows: CoverageRow[] = [];
  for (const [first, ...rest] of groups.values()) {
    if (!first) continue;
    const entries = [first, ...rest];
    const refs = [...new Set(entries.flatMap((e) => (e.ref ? [e.ref] : [])))];
    const codes = new Set(entries.map((e) => e.reason));
    const only = codes.size === 1 ? first.reason : null;
    rows.push({
      input: first.input,
      status: first.status,
      refs,
      reason: isKnown(only) ? only : null,
      count: refs.length || 1,
    });
  }
  return rows;
}
