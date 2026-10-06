import type { BriefInput, BriefMissingInput } from '@devdigest/shared';
import {
  BLAST_CRONS_MAX,
  BLAST_ENDPOINTS_MAX,
  BLAST_SYMBOLS_MAX,
  BRIEF_INPUT_TOKEN_BUDGET,
  SCHEMA_TOKEN_RESERVE,
  TRIM_GROUP_INPUT,
  TRIM_ORDER,
  type TrimGroup,
} from './constants.js';
import { buildBriefMessages } from './prompt.js';
import type { BriefBlastFacts, BriefFacts, FitResult, TokenCounter } from './types.js';

/** Nothing is left to trim and the facts still exceed the budget (AC-45). */
export class BriefBudgetError extends Error {
  constructor() {
    super('brief inputs exceed the token budget');
    this.name = 'BriefBudgetError';
  }
}

/** Slice the blast arrays to their caps; `truncated` is true when anything was cut (AC-44). */
export function capBlast(blast: BriefBlastFacts): { blast: BriefBlastFacts; truncated: boolean } {
  const truncated =
    blast.changed_symbols.length > BLAST_SYMBOLS_MAX ||
    blast.endpoints.length > BLAST_ENDPOINTS_MAX ||
    blast.crons.length > BLAST_CRONS_MAX;
  if (!truncated) return { blast, truncated };
  return {
    blast: {
      ...blast,
      changed_symbols: blast.changed_symbols.slice(0, BLAST_SYMBOLS_MAX),
      endpoints: blast.endpoints.slice(0, BLAST_ENDPOINTS_MAX),
      crons: blast.crons.slice(0, BLAST_CRONS_MAX),
    },
    truncated,
  };
}

function countFacts(facts: BriefFacts, counter: TokenCounter): number {
  return buildBriefMessages(facts).reduce((n, m) => n + counter.count(m.content), 0);
}

/** Cut the last item of a group; false when the group is already empty. */
function trimOnce(
  facts: BriefFacts,
  group: TrimGroup,
  fits: (f: BriefFacts) => boolean,
): BriefFacts | null {
  switch (group) {
    case 'attached_specs':
      return facts.docs.length ? { ...facts, docs: facts.docs.slice(0, -1) } : null;
    case 'linked_issue': {
      if (!facts.issues.length) return null;
      const last = facts.issues[facts.issues.length - 1]!;
      const issues =
        last.body !== ''
          ? [...facts.issues.slice(0, -1), { ...last, body: '' }]
          : facts.issues.slice(0, -1);
      return { ...facts, issues };
    }
    case 'pr_description': {
      if (facts.description === '') return null;
      // Longest prefix that fits (binary search on length); 0 when none does.
      let lo = 0;
      let hi = facts.description.length - 1;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (fits({ ...facts, description: facts.description.slice(0, mid) })) lo = mid;
        else hi = mid - 1;
      }
      return { ...facts, description: facts.description.slice(0, lo) };
    }
    case 'blast_callers':
      return facts.blast?.callers.length
        ? { ...facts, blast: { ...facts.blast, callers: facts.blast.callers.slice(0, -1) } }
        : null;
    case 'blast_symbols':
      return facts.blast?.changed_symbols.length
        ? {
            ...facts,
            blast: { ...facts.blast, changed_symbols: facts.blast.changed_symbols.slice(0, -1) },
          }
        : null;
    case 'review_findings':
      return facts.findings.length ? { ...facts, findings: facts.findings.slice(0, -1) } : null;
    case 'changed_files':
      return facts.files.length ? { ...facts, files: facts.files.slice(0, -1) } : null;
  }
}

/** Number of one-item trims a list-shaped group still allows (0 when empty). */
function trimCapacity(facts: BriefFacts, group: TrimGroup): number {
  switch (group) {
    case 'attached_specs':
      return facts.docs.length;
    case 'linked_issue':
      // Each issue is cut in two steps: body first, then the issue itself.
      return facts.issues.reduce((n, i) => n + (i.body !== '' ? 2 : 1), 0);
    case 'pr_description':
      return 0; // handled by its own binary search in trimOnce
    case 'blast_callers':
      return facts.blast?.callers.length ?? 0;
    case 'blast_symbols':
      return facts.blast?.changed_symbols.length ?? 0;
    case 'review_findings':
      return facts.findings.length;
    case 'changed_files':
      return facts.files.length;
  }
}

/** The facts after `k` successive one-item trims of `group` (k <= capacity). */
function trimBy(facts: BriefFacts, group: TrimGroup, k: number): BriefFacts {
  const never = (): boolean => false;
  let cur = facts;
  switch (group) {
    case 'linked_issue':
      for (let i = 0; i < k; i++) cur = trimOnce(cur, group, never) ?? cur;
      return cur;
    case 'attached_specs':
      return { ...facts, docs: facts.docs.slice(0, facts.docs.length - k) };
    case 'blast_callers':
      return facts.blast
        ? { ...facts, blast: { ...facts.blast, callers: facts.blast.callers.slice(0, facts.blast.callers.length - k) } }
        : facts;
    case 'blast_symbols':
      return facts.blast
        ? {
            ...facts,
            blast: {
              ...facts.blast,
              changed_symbols: facts.blast.changed_symbols.slice(0, facts.blast.changed_symbols.length - k),
            },
          }
        : facts;
    case 'review_findings':
      return { ...facts, findings: facts.findings.slice(0, facts.findings.length - k) };
    case 'changed_files':
      return { ...facts, files: facts.files.slice(0, facts.files.length - k) };
    case 'pr_description':
      return facts;
  }
}

/**
 * Trim `facts` into the token budget (AC-11/12). Groups are drained in
 * `TRIM_ORDER`, each from its end; per group a binary search finds the fewest
 * trims that fit (O(log n) token counts, not one per item). Each touched input
 * is recorded once. Throws `BriefBudgetError` when every group is empty and the
 * facts still do not fit (AC-45).
 */
export function fitToBudget(
  facts: BriefFacts,
  counter: TokenCounter,
  budget: number = BRIEF_INPUT_TOKEN_BUDGET - SCHEMA_TOKEN_RESERVE,
): FitResult {
  const fits = (f: BriefFacts): boolean => countFacts(f, counter) <= budget;
  const touched = new Set<BriefInput>();
  let current = facts;
  if (!fits(current)) {
    for (const group of TRIM_ORDER) {
      if (group === 'pr_description') {
        const next = trimOnce(current, group, fits);
        if (next) {
          touched.add(TRIM_GROUP_INPUT[group]);
          current = next;
          if (fits(current)) break;
        }
        continue;
      }
      const cap = trimCapacity(current, group);
      if (cap === 0) continue;
      // Smallest k in [1, cap] that fits; cap when even the empty group does not.
      let lo = 1;
      let hi = cap;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (fits(trimBy(current, group, mid))) hi = mid;
        else lo = mid + 1;
      }
      touched.add(TRIM_GROUP_INPUT[group]);
      current = trimBy(current, group, lo);
      if (lo < cap || fits(current)) break;
    }
    if (!fits(current)) throw new BriefBudgetError();
  }
  const truncated: BriefMissingInput[] = [...touched].map((input) => ({
    input,
    status: 'truncated',
    ref: null,
    reason: null,
  }));
  return { facts: current, truncated };
}
