---
status: done
packages: server, client
---

# 002 — Severity counter: count findings by level, click a level to filter

## Problem

A review's findings are not all worth the same. Two CRITICALs and four
SUGGESTIONs is a very different pull request from six SUGGESTIONs, and today
neither screen says which one you are looking at.

- The **Pull Requests list** shows a SCORE ring and nothing else about what was
  found. A 61 could be one blocker or six nits; the only way to tell is to open
  the PR. The server already knows — `rollupSeverities()` has sat unused in
  `server/src/modules/pulls/status.ts:23` since it was written, and
  `routes.ts:110` carries the comment *"the per-severity FINDINGS breakdown is
  intentionally not surfaced on the list"*. This spec reverses that call.
- The **PR detail → Agent runs timeline** shows `3 finding(s) · 2 blockers`
  (`RunHistory.tsx:194`). "3 findings" is the least informative number in the
  row: it does not say whether this run found anything that should block.
- And once a count is on screen, the user's next move is always the same — *show
  me those two*. There is no way to do it. `FindingsPanel` filters on confidence
  only (`helpers.ts:5`); severity is a sort key, never a filter.

## Scope

- A **severity counter**: per-level counts (CRITICAL / WARNING / SUGGESTION) as
  icon+number chips, on two screens:
  1. **Pull Requests list** — a new `FINDINGS` column between `SCORE` and
     `STATUS`, counting every review run of that PR.
  2. **PR detail → Agent runs timeline** — chips on each run row, replacing that
     row's `3 finding(s)` text, counting that one run.
- **Click a level → see only that level.** From the list, that means navigating
  to the PR's Agent-runs tab with the filter applied; from a run row, it means
  opening that run's accordion filtered to the level.
- The filter lives in the **URL** (`?severity=`, optionally scoped by `?sevRun=`),
  so a filtered view is shareable, survives reload, and is what the list links
  into.
- One shared `SeverityCounter` component with two variants, and one severity
  vocabulary (colour, icon, order, label) that both screens read from.
- **Hovering the counter previews the findings themselves** — title, category,
  `file:line`, confidence and the opening of the rationale — so the user can tell
  *what* the two criticals are before deciding to open anything. Same card on
  both screens: `6 FINDINGS` over a PR row, `2 FINDINGS IN THIS RUN` over a run
  row.

**Not in scope.** New DB columns and any migration other than one missing index —
per-run counts are derived from data the client already holds (see *Design*).
Any action inside the hover card: it previews and nothing more — no accept /
dismiss, no pinning it open, no links out of it (it is a hover surface, and a
click target inside one that vanishes on mouse-out is a trap). Filtering or sorting the PR **list** by
severity (the column counts and links; the list's own filter chips stay
status-only). Multi-select severity. Filtering the Files-changed tab, the trace
drawer, or the CI/eval screens. Changing what counts as a blocker, what a score
means, or any severity taxonomy change — `Severity` stays the three values in
`contracts/findings.ts:11`.

## Design

### What gets counted

| Screen | Set counted | Excluded |
|---|---|---|
| PR list `FINDINGS` column | every finding of **every** review run of the PR | `dismissed_at IS NOT NULL` |
| Timeline run row | the findings of **that run's** review | dismissed |

Dismissed findings are excluded so the counter falls as the user triages —
matching `ReviewRunAccordion.tsx:55`, which already computes its blocker count
that way. The consequence, recorded here so it does not read as a bug: the list
column is **not** always the arithmetic sum of the timeline rows below it once
something has been dismissed.

**Null is not zero.** `findings: null` means the PR has never been reviewed and
renders `—`, exactly like `score` and `cost_usd` do. `{critical: 0, warning: 0,
suggestion: 0}` means reviewed and clean, and renders a muted `0`. A level with
a zero count renders **no chip at all** (the mockup's PR #455 shows `⚠2 ⚲4` with
no critical chip) — so the three states are visually distinct.

### Data flow — and why only one side needs the server

```
PR LIST (needs the server)
  findings ⋈ reviews  ──IN-query on the page's pr_ids──▶ rollupSeverities()
                                                            │
                                            PrMeta.findings  ▼
                                        FINDINGS column ◀── SeverityCounter

TIMELINE (needs nothing new)
  usePrReviews(prId) ──▶ ReviewRecord[] { run_id, findings[] }  (already fetched)
                                    │ group by run_id, rollup in JS
                                    ▼
                          run row chips ◀── SeverityCounter
```

The PR detail page **already loads every finding of every run** — `usePrReviews`
returns `ReviewRecord.findings`, and `page.tsx:73` already flattens exactly that
array. So the timeline's per-run counts are a `useMemo` over data in hand:

- **no new columns on `agent_runs`**, no migration, no backfill;
- the counts respond to a dismissal immediately, which denormalized columns
  would not;
- `RunSummary` is unchanged, so nothing in the trace/runs contract moves.

`findings_count` and `blockers` stay on the run row and keep their jobs (the
outcome badge in `outcomeOf()` reads `blockers`). The chips replace only the
`{count} finding(s)` **text**. A run with no linked review — a failed run, or one
whose review was deleted — has no chips to derive, and falls back to that
existing text line.

The PR list has no such luck: it holds `PrMeta` and nothing else, so the counts
come from the API.

### Contract changes (`shared` first, then consumers)

Both vendored copies change **by hand**, field by field — never `cp`. The two
trees have drifted independently (root `INSIGHTS.md`), so the check is a `diff`
scoped to these fields, not whole-file equality.

| Contract | Change |
|---|---|
| `contracts/findings.ts` | `+ export const SeverityCounts = z.object({ critical, warning, suggestion })` — all `z.number().int()` |
| `contracts/platform.ts` → `PrMeta` | `+ findings: SeverityCounts.nullish()` — list endpoint only, like `score` and `cost_usd` |

`SeverityCounts` is declared in `shared` rather than kept as the server-local
`interface` it is today (`status.ts:16`) because it is now on the wire; the
server helper is retyped to the shared one so there is a single definition.

### Server

One more IN-query in `GET /repos/:id/pulls`, in the same shape as the score and
cost rollups above it (one query for the page, grouped in JS):

```sql
SELECT reviews.pr_id, findings.severity
  FROM findings JOIN reviews ON findings.review_id = reviews.id
 WHERE reviews.pr_id = ANY($1)
   AND reviews.kind = 'review'
   AND findings.dismissed_at IS NULL
```

Grouped by `pr_id` and fed to the existing `rollupSeverities()` — which needs no
change and is already unit-tested (`server/test/pulls-status.test.ts:57`).

Whether a PR gets `null` or `{0,0,0}` is decided by the score rollup's map that
is already built one block up: `latestReviewByPr.has(pr.id)` is exactly "has this
PR ever been reviewed". No fourth query.

**One migration, and it is an index.** `findings.review_id` is a foreign key with
no index — the same trap spec 001 hit twice and documented: Postgres indexes the
column a FK *points at*, never the column holding it. Without it this join
sequential-scans every finding in the workspace on every list render. Generated,
not hand-written: `pnpm db:generate` → `0012_*.sql`, applied with `pnpm
db:migrate` (the server never migrates on boot).

```ts
// server/src/db/schema/reviews.ts — findings table
(t) => ({ reviewIdx: index('findings_review_idx').on(t.reviewId) })
```

### The filter, and where its state lives

Two URL params on the PR detail route, alongside the `?tab=` and `?trace=` that
already live there:

| Param | Meaning |
|---|---|
| `?severity=CRITICAL\|WARNING\|SUGGESTION` | show only this level |
| `?sevRun=<runId>` | *(optional)* confine that filter to one run |

| Entry point | Result |
|---|---|
| List chip `⚠2` on PR #482 | `/repos/:id/pulls/482?tab=findings&severity=WARNING` — every run accordion filtered |
| Timeline chip `⚠1` on the Performance Reviewer row | `…&severity=WARNING&sevRun=<runId>` — only that run's accordion filtered, opened and scrolled to |
| Clicking the **active** chip again | both params removed — back to all findings |
| Clicking a different level | `severity` replaced (single-select; `sevRun` set or cleared to match the chip clicked) |

A `severity` value that is not one of the three is **ignored**, not an error —
the param is user-editable and a typo must not blank the page.

The timeline click reuses the existing `onGoToReview` → `targetRunId`/
`targetNonce` machinery (`FindingsTab.tsx:70`, `ReviewRunAccordion.tsx:45`) for
the open-and-scroll half. Clicking the chip is therefore the agent-name click
plus a filter, not a second navigation mechanism.

**What a page-level filter does to the run list.** Accordions with no matching
finding are **hidden** (the user asked for warnings; a run with none is noise),
and the ones that remain **open by default** so the findings are on screen
without a further click. The count of hidden runs is shown next to the active
filter chip. If every run is hidden, the tab's existing `EmptyState` covers it.
A `sevRun`-scoped filter hides nothing: other runs render normally, unfiltered.

Filtering composes with the existing hide-low-confidence toggle as **AND** —
`visibleFindings(findings, hideLow, severity)`, one function, one place.

### Client

**One severity vocabulary.** `client/src/lib/severity.ts` — colour, icon, order
and i18n label key per level, plus the `parseSeverityParam()` used to read the
URL:

| Level | Colour | Icon | Order |
|---|---|---|---|
| CRITICAL | `var(--crit)` | `AlertOctagon` | 0 |
| WARNING | `var(--warn)` | `AlertTriangle` | 1 |
| SUGGESTION | `var(--sugg)` | `Lightbulb` | 2 |

`SEV_COLOR` in `FindingCard/constants.ts` and `SEVERITY_ORDER` in
`FindingsPanel/constants.ts` are re-pointed at it and stop being separate
sources of truth. Three components colouring severity from two tables is how a
CRITICAL ends up amber in one place.

**`client/src/components/severity-counter/`** — shared chrome in `src/components/`
for the same reason `RunCostBadge` is (spec 001): two routes need it, and they
must not drift on which icon means which level.

```ts
SeverityCounter({
  counts: SeverityCounts | null,
  variant?: "cell" | "inline",      // PR list column | timeline run row
  active?: Severity | null,          // the level currently filtered
  onSelect?: (s: Severity) => void,  // absent ⇒ static, no button chrome
})
```

- `counts == null` → `—`; all-zero → a muted `0`; zero levels render no chip.
- With `onSelect`, each chip is a real `<button>` with `aria-pressed={active === s}`
  and an i18n `aria-label` — keyboard-reachable, not a clickable `<span>`.
- **The chip must `stopPropagation()`.** The whole PR row is a click target that
  navigates (`PRRow.tsx:25`); without it, a chip click fires both the filtered
  navigation and the row's unfiltered one, and the row wins.

**Layout.** `GRID` in the list's `constants.ts:27` goes from
`"1fr 132px 92px 60px 118px 78px 78px"` to
`"1fr 132px 92px 60px 104px 118px 78px 78px"`, with `"findings"` inserted into
`COLUMN_KEYS` after `"score"`. Header and rows share the one constant, so they
stay in lock-step by construction.

### The hover preview

One card, `client/src/components/findings-preview/`, over both counters. Header
is a count (`6 FINDINGS` / `2 FINDINGS IN THIS RUN`); each row is one finding —
severity badge, title, category tag, `file:line`, confidence, and the first lines
of the rationale, clamped. It reuses `SeverityBadge`, `CategoryTag`, `MonoLink`
and `ConfidenceNum` rather than restyling any of them.

At most `PREVIEW_LIMIT` findings render, with `+N more` below; a PR with twenty
findings must not produce a card taller than the viewport. Dismissed findings are
excluded, exactly as they are from the counts — the card and the number beside it
must never disagree.

**Where the data comes from — and the one deliberate fetch.**

| Screen | Source |
|---|---|
| Timeline run row | `usePrReviews` is already loaded on this page; the findings are in hand, so hovering costs nothing |
| PR list row | **lazily fetched on first hover**: `usePrReviews(hovered ? pr.id : null)` |

The PR list holds `PrMeta` and nothing else, so previewing content there needs
the findings from somewhere. Three options were weighed: widen `PrMeta` with a
preview array (every list render pays for content almost no one hovers), a new
preview endpoint (a second way to read findings), or reuse the existing
per-PR reviews query on demand. The last one wins: no contract change, no new
route, `enabled` already gates the hook on a null id, and the response is cached
by TanStack Query — so the hover **warms the exact cache the PR detail page
reads**, and the navigation that usually follows a hover is faster, not slower.

This is a real departure from spec 001's "no extra requests on any read path",
so it is stated plainly: hovering a PR row issues one request for that PR, once.
Nothing is fetched until a pointer (or keyboard focus) lands on the counter.

**Positioning is a portal, not `position: absolute`.** The list's `tableCard`
sets `overflow: hidden` (`pulls/styles.ts`), which clips any child popover at the
row boundary. The card renders through `createPortal` into `document.body` with
fixed coordinates measured from the trigger, and flips above the trigger when it
would otherwise run past the bottom of the viewport.

**Hover is not the only way in.** The counter's chips are real buttons, so the
card opens on `focus-within` as well as on hover — otherwise the preview is
invisible to keyboard and screen-reader users. It closes on `Escape`, on blur,
and on mouse-out.

**Copy** comes from `next-intl`, no hardcoded strings: `prReview.list.columns.findings`,
`prReview.severity.{critical,warning,suggestion}`, `prReview.severity.countTooltip`,
`prReview.severity.filterActive`, `prReview.severity.clearFilter`,
`prReview.severity.hiddenRuns`, `prReview.severity.none`.

## Acceptance

1. A PR reviewed by two agents shows, in the list's `FINDINGS` column, the
   per-level totals across **both** runs; the numbers match what the PR's
   Agent-runs tab shows when opened.
2. Dismissing a finding drops the list count for its level by one on the next
   load; dismissing the last CRITICAL removes the critical chip rather than
   showing `⊙0`.
3. A PR that has never been reviewed shows `—`; a reviewed PR with zero surviving
   findings shows a muted `0`. The two are never rendered the same way.
4. Clicking `⚠2` in the list lands on
   `…/pulls/482?tab=findings&severity=WARNING`, and only WARNING findings are
   visible there — across every run of that PR. Reloading that URL reproduces it.
5. Clicking a list chip navigates **once**, to the filtered URL — the row's own
   navigation does not also fire.
6. A timeline run row shows that run's chips in place of `3 finding(s)`, keeps
   its `· 2 blockers` suffix, and keeps its outcome badge colour (both still read
   `blockers`).
7. Clicking `⚠1` on a run row opens **that run's** accordion, scrolls to it, and
   shows only its WARNING findings. The other runs stay collapsed and unfiltered.
8. Clicking the active chip again removes `severity` and `sevRun` from the URL
   and restores every finding.
9. With a page-level filter active, runs with no matching finding are hidden, the
   remaining accordions are open, and the hidden-run count is shown. Filtering to
   a level no run has shows the tab's empty state, not a blank page.
10. Severity filter and hide-low-confidence apply together: a low-confidence
    WARNING is hidden when both are on.
11. `?severity=BANANA` renders the page unfiltered, with no crash and no error
    state.
12. A run whose review is missing (failed, or review deleted) renders its old
    `{count} finding(s)` line and no chips.
13. The list endpoint issues **one** additional query per request regardless of
    how many PRs are on the page, and `EXPLAIN` shows the findings join using
    `findings_review_idx`.
14. Zero LLM calls anywhere, and zero new requests for the **counts**: the
    timeline's come from the `usePrReviews` response already on the page, the
    list's ride along with the list payload. The hover preview is the single
    exception — see 16.
15. Hovering a counter shows a card listing that PR's / that run's findings, with
    title, category, `file:line`, confidence and a clamped rationale. The card's
    item count agrees with the chips beside it, dismissed findings absent from
    both. Over the PR list it is not clipped by the table's `overflow: hidden`,
    and near the bottom of the viewport it flips above the trigger.
16. Nothing is requested until a pointer or keyboard focus reaches the counter;
    hovering the same PR twice issues one request, not two; and the response is
    the same cache entry the PR detail page then reads.
17. Keyboard-tabbing to a chip opens the same card, and `Escape` closes it.
18. `pnpm typecheck` passes in `server/` and `client/`, and `PrMeta.findings` +
    `SeverityCounts` are byte-identical in the two vendored `shared` copies.
    (Only those fields — the copies had already drifted before this spec, and
    closing that gap is not this feature's job.)

## Implementation order

Each step is independently reviewable and leaves the app working.

**1 — Contracts (`shared`, server copy first).**
`SeverityCounts` in `contracts/findings.ts`; `PrMeta.findings` in
`contracts/platform.ts`. Mirror both into `client/src/vendor/shared` by hand.
Retype `status.ts`'s local `SeverityCounts` to the shared one.
*Check:* `pnpm typecheck` in both packages; `diff` scoped to the two new fields.

**2 — Server: index, query, rollup.**
`findings_review_idx` on the schema → `pnpm db:generate` → `pnpm db:migrate`.
The findings⋈reviews IN-query in `routes.ts`, grouped in JS through the existing
`rollupSeverities()`; `null` when `latestReviewByPr` has no entry for the PR.
Delete the now-false "intentionally not surfaced" comment at `routes.ts:110`.
*Tests:* `server/test/pulls-status.test.ts` gains the null-vs-zero case (pure);
dismissed-exclusion is DB behaviour, so it goes in a `*.it.test.ts` — the suffix
is what puts it on the Docker side of the CI split.

**3 — Client: one severity vocabulary.**
`src/lib/severity.ts`; re-point `FindingCard/constants.ts` and
`FindingsPanel/constants.ts` at it. Pure refactor, no visible change — land it
before anything renders chips so the new screens never read the old tables.

**4 — `SeverityCounter` component.**
`src/components/severity-counter/` with both variants, static and interactive,
plus `SeverityCounter.test.tsx`: null → `—`, all-zero → `0`, zero level → no
chip, `onSelect` fires with the right level, `aria-pressed` tracks `active`.

**5 — Screen 1: the list column.**
`GRID` + `COLUMN_KEYS` + the cell in `PRRow.tsx`, with `stopPropagation` and the
filtered `router.push`. i18n keys.
*Test:* the chip navigates to the `?severity=` URL and the row handler does not
also fire — acceptance 5 is the one that breaks silently.

**6 — The filter itself (PR detail).**
`?severity=` / `?sevRun=` read in `page.tsx` beside the existing `?tab=`/`?trace=`
handling; `visibleFindings(findings, hideLow, severity)`; the active-filter chip
and its clear button in the panel toolbar; hide/auto-open logic and the
hidden-run count in `FindingsTab`.
*Tests:* `FindingsPanel.test.tsx` for filter × hideLow AND, and for the bad-param
case.

**7 — Screen 2: chips on the timeline.**
Derive `Map<runId, SeverityCounts>` with a `useMemo` over `usePrReviews` data,
pass it into `RunHistory`, swap the `{count} finding(s)` text for the counter,
keep the blockers suffix and the no-review fallback. Wire the chip click to
`onGoToReview` + both params.
*Test:* `RunHistory.test.tsx`. Its fixture factory is the one named in the root
`INSIGHTS.md` TS2719 entry — if that error appears, the fix is the factory's
defaults literal, not a tsconfig hunt.

**8 — e2e.**
Extend `e2e/specs/04-pr-findings.flow.json` (or add `08-severity-filter.flow.json`):
seeded PR list → click a severity chip → `wait --url "severity=WARNING"` →
`wait --text` on a warning finding → assert a critical-only finding's title is
gone. `wait` is the assertion in this suite.

**9 — The hover preview.**
`src/components/findings-preview/` (the card), plus a `HoverCard` wrapper that
portals to `document.body`, measures the trigger, and flips when it would overflow
the viewport. Wire it around the counter on both screens: the timeline passes the
findings it already has; `PRRow` passes `usePrReviews(hovered ? pr.id : null)`.
*Tests:* the card renders the count header, one row per finding, `+N more` past
the cap, and no dismissed finding; `PRRow` fetches nothing until hovered.

**Rollout.** Step 2's migration must be applied before a client built from step 5
is served — an unmigrated DB still answers, just slowly. There is no backfill and
no data to convert: the counts are computed on read, so the feature is live for
historical PRs the moment the endpoint ships.
