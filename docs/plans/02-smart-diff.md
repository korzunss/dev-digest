# Development Plan: Smart Diff — reviewer-ordered Files changed tab with inline findings
Status: done
Save as: docs/plans/02-smart-diff.md
Spec: specs/007-smart-diff.md

## Goal & acceptance criteria
The PR's "Files changed" tab gets a reviewer-ordered view. Files are grouped by role (core → tests → wiring → docs → boilerplate) by a pure `classifyFile(path)` that can be imported without HTTP. The grouping is served by `GET /pulls/:id/smart-diff`. After a review has run, the tab also shows which groups and files have findings, and the findings appear inline under their lines, rendered as an inline finding card (originally the existing FindingCard; since 2026-09-27 the tab's own card per D19-B). "Original order" keeps today's flat list, with the same dots and inline findings.

- **AC1:** `classifyFile(path): SmartDiffRole` is a pure function exported from `@devdigest/reviewer-core`. Its patterns and both role orders live in a constants file.
  - Its table-driven test was written and run red before the implementation (S2 before S3).
  - The table includes `__tests__/__snapshots__/x.snap` → `boilerplate`, `.claude/skills/security/SKILL.md` → `wiring`, `e2e/README.md` → `tests`, `src/config.ts` → `core` and `server/pnpm-lock.yaml` → `boilerplate`.
  - The classifier has no I/O imports, no `fetch` and no `process.env`.
- **AC2:** `SmartDiffRole` = `['core','tests','wiring','docs','boilerplate']` in both `server/src/vendor/shared/contracts/brief.ts` and `client/src/vendor/shared/contracts/brief.ts`. A diff scoped to the `// ---- Smart Diff ----` block of the two copies is empty.
- **AC3:** `GET /pulls/:id/smart-diff` returns a `SmartDiffResponse` with:
  - only non-empty groups, in role order (D5);
  - files inside each group sorted by path (D6);
  - `finding_lines` = the sorted, de-duplicated `start_line` values of the **latest `kind='review'` review's** undismissed findings for that file (D3, D4);
  - `split_suggestion` = `{too_big:false, total_lines: Σ(additions+deletions), proposed_splits: []}`.
  A PR outside the workspace, or an unknown PR, returns 404.
- **AC4:** The Files changed tab shows:
  - a "REVIEWER-ORDERED DIFF" header;
  - "N files · +A −D";
  - a `Smart order | Original order` toggle built as `role="radiogroup"` with two `role="radio"` items carrying `aria-checked`. It defaults to Smart order.
  In Smart order each group header shows: a chevron, a coloured square, the role label, a muted hint, and "N files" on the right. The header is a `button` with `aria-expanded` and `aria-controls`. `docs` and `boilerplate` start collapsed; the other groups start open, and files inside them follow `AUTO_EXPAND_MAX_LINES`. A lock file lands in Boilerplate.
- **AC5:** Once the latest review has findings:
  - a group header shows a red dot and the number of **files** in that group with findings, before "N files" (2 files with 5 findings → ●2);
  - a file card shows a dot next to its path, with no number, separate from the MessageSquare comment counter.
  Both come from the route's `finding_lines`.
- **AC6:** In an expanded file, each finding of the latest review:
  - renders under the line `RIGHT:${start_line}` as FindingCard (severity, title, category, line/confidence, rationale, suggested fix, Accept/Dismiss), plus a close × button;
  - *(2026-09-27: superseded in part — the card is the tab's own card per D19-B/AC21, and multi-line findings are placed per D18-A/AC22.)*
  - gives that line a severity-coloured left bar and a right-side label: CRITICAL→`blocker`, WARNING→`warning`, SUGGESTION→`suggestion`. The colour comes from `severityColor`; no new palette is added.
  Findings whose line is not in the rendered patch appear in an "outside the shown diff" block at the bottom of the file, so none is dropped. Accept/Dismiss refresh both the dots and the cards.
- **AC7:** Original order renders the PR's flat file list, exactly as `DiffViewer` does today, with the same file dots and inline findings.
- **AC8:** The Agent runs / findings tab is unchanged, and the existing client, server and reviewer-core suites stay green.
- **AC9:** `prReview.json → smartDiff` contains `testsLabel` and `docsLabel`, plus the header, toggle, hint, counter and line-label keys (S9). No new copy is hard-coded in JSX.
- **AC10 (manual, needs sign-off):** On a PR in the user's fork that contains a lock file, core logic under `server/src` or `client/src`, a test, and a config or barrel file, the groups, collapse defaults, dots and inline findings behave as in AC4–AC7 after Run review.
- **AC11 (process):** The pipeline is planner → implementer (G1…G4) → (architecture-reviewer ∥ plan-verifier). The PR description says which subagent did what.
- **AC12:** One "Show/Hide comments" toggle in the DiffTab header controls both GitHub comment threads (inline and outdated) and inline finding content (cards, collapsed stubs, and the "outside the shown diff" block). It works in both orders.
  - It renders when `commentCount > 0 || findings.length > 0`.
  - Its label comes from `smartDiff.showComments` / `smartDiff.hideComments` with `{count}` = comments + findings of the latest review.
  - While hidden, these stay visible: file dots, the group ●N counter, and the line bar + severity label.
  - The default follows D13.
- **AC13:** `.it`: for a PR with `pr_files` and no reviews at all, `GET /pulls/:id/smart-diff` returns 200 with role-ordered groups and `finding_lines: []` for every file. No injected LLM provider records a call, and no `reviews` row is created for that PR.
- **AC14 (D9-B):** The × on an inline finding collapses the card into a one-line stub: a `button` with `aria-expanded="false"`, showing the severity icon, the uppercase severity word and the finding title (S27). Clicking the stub restores the full card. The line bar and label stay in both states.
- **AC15:** In Smart order, each group header is `position: sticky`, with `top` set to the PR detail header's measured height (`var(--pr-header-h, 0px)`). It never goes under the PR header or its tabs, and it stays below it in z-order (`zIndex` 2 < 5). The group wrapper uses `overflow: clip`, not `hidden`.
- **AC16:** When `usePrReviews` has loaded and contains no `kind='review'` review, the DiffTab header area shows `smartDiff.reviewNotRun`. It is not shown while reviews are loading, and not once a `kind='review'` review exists. A `kind='summary'` review alone still shows it. Dots and counters keep coming only from the route, which returns empty `finding_lines` before a review (AC13).
- **AC17:** When the PR's active runs drop from ≥1 to 0, the page invalidates `["reviews", prId]` (which, by prefix, also covers `["reviews", prId, "smart-diff"]`) and `["pr-runs", prId]`, whichever tab is open. Counters, dots, cards and the AC16 line update without a reload. FindingsTab's `onRunDone` behaviour is unchanged.
- **AC18:** `prReview.smartDiff` contains `showComments`, `hideComments` and `reviewNotRun`. `DiffTab.tsx` no longer contains the literal `"Show comments"` / `"Hide comments"`.
- **AC19 (fix mode, D11/D12):** `classifyFile('package.json')` and `('client/package.json')` return `wiring`. `('client/next-env.d.ts')`, `('src/types/global.d.ts')` and `('lib/index.d.ts')` return `boilerplate`. `('server/src/vendor/shared/contracts/brief.ts')` returns `core`. The new rows were run red before the constants change.
- **AC20 (manual, needs sign-off):** On the AC10 fork PR:
  - (1) The group header stays pinned under the PR header while its files scroll.
  - (2) Start Run review, switch to Files changed before it finishes, and the dots, ●N and cards appear without a reload.
  - (3) The toggle hides and shows cards and comments while dots and bars stay.
  - (4) Before any review, the empty-state line shows.
- **AC21 (design, mockup "webhooks.ts"):** The inline finding card matches the mockup, not the Agent runs FindingCard:
  - header: severity icon in a tinted square, the uppercase severity word (`BLOCKER` / `WARNING` / `SUGGESTION`, from `smartDiff.lineLabel`), the title and the category tag; under it `line 61-74 ● 79% conf` (no file path);
  - a single × at the top right of the header, no chevron; × collapses to the D9-B stub;
  - a 3px severity-coloured left border, 8px radius, four-side longhand borders;
  - inset like GitHub comment threads: `margin: 6px 14px 8px 58px`;
  - body: rationale, SUGGESTED FIX box, Accept / Dismiss.
  The line label is an outlined pill: 1px severity-coloured border, lightly tinted background, 6px radius, the severity icon and the lowercase word (`blocker`). `FindingCard` and the Agent runs tab are unchanged.
- **AC22 (D18-A, ranges):** For a finding with `start_line < end_line`, every rendered **added** (RIGHT-side `add`) line within `start_line…end_line` gets the bar and the label pill, and the card renders once, under the **last** such line. Context lines in the range get no marker. If the range has no rendered added line but `start_line` is rendered, the marker and card go on `start_line`. If no line of the range is rendered, the finding goes to the "outside the shown diff" block. A single-line finding behaves as before (AC6).

## Decisions needed
| # | Decision | Options | Recommendation | Steps affected |
|---|---|---|---|---|
| D1 | Spec first? | A: `doc-writer` writes `specs/007-smart-diff.md` from this Goal/AC before approval · B: the plan stands alone | A — `specs/README.md`: cross-package features get a spec; plan 01 did the same | header |
| D2 | Where `classifyFile` + constants live | A: `reviewer-core/src/smart-diff/` (exported; server uses it through the `@devdigest/reviewer-core` alias) · B: `server/src/modules/smart-diff/classify.ts` | A — the planned "filter before prompt assembly" belongs next to `assemblePrompt`. reviewer-core purity guarantees no HTTP/DB. `review/scope.ts` is the precedent | S2, S3, S4 |
| D3 | Which findings feed the view | A: the single latest review with `kind='review'` (assignment literal; same rule as the PR-list score, `pulls/routes.ts:131-141`) · B: the latest review per agent (union) | A — literal and consistent with the list. Limitation: with several agents, only the newest agent's review shows (Risks) | S4, S5, S10 |
| D4 | Dismissed findings | A: excluded from `finding_lines`, dots, counts and the line bar/label; their inline card still renders muted, so Accept/Dismiss stays reversible · B: counted everywhere | A — matches spec 002 counters and "blocker = undismissed CRITICAL" | S4, S13 |
| D5 | Empty groups | A: the route omits them · B: the route returns all five and the client hides the empty ones | A — the mockups show none; the client never renders an empty group either way | S4 |
| D6 | File order inside a group | A: path ascending (code-unit compare) on the server · B: `pr_files` read order | A — `pr_files` has no ordering column (`schema/pulls.ts:36-45`), so B is nondeterministic | S4 |
| D7 | Where the toggle state lives | A: local `useState` in DiffTab, default `smart` · B: URL param via page `setParams` | A — keeps DiffTab at ≤7 props; order is a view preference, not a shareable filter | S11 |
| D8 | Directory rules (`dist/`, `build/`, `e2e/`, `docs/`, `.github/`, `.claude/`, plus `test/`, `tests/`, `__tests__/`) | A: match a path **segment at any depth** · B: root only (literal glob) | A — this repo has four packages (`server/dist/…`, `client/.claude/…`). Risk: a code folder named `build/` → boilerplate | S2, S3 |
| D9 | Close × on an inline finding | A: hides the card until the file is reopened · B: collapses into a one-line stub (severity + title); clicking the stub re-expands; the line bar/label stay | **B — changed from A on 2026-09-26 (user, P3 review wish)** | S13 (superseded by S22) |
| D10 | Group colours + hints not in the mockups | Colours A: core `var(--accent)`, tests `var(--ok)`, wiring `var(--info)` → **`var(--warn)` since 2026-09-27 (user, match the mockup)**, docs `var(--text-muted)`, boilerplate `var(--border-strong)`. Hints A: tests "Proves the change works — check what's covered", docs "Explains the change — skim" · B: user supplies | A — existing CSS vars only (`vendor/ui/styles.css`) | S9, S10 |
| D13 | Default of the shared comments/findings toggle | A: always hidden (today's comment default; the demo would need a click) · B: always shown · C: one state `userChoice: boolean \| null`, effective `showInline = userChoice ?? findings.length > 0` | C — one state for both. It keeps today's "hidden" default on PRs without a review, and after a review the cards are visible by default, which the demo needs. Posting a comment sets `userChoice = true`, as today | S24 |
| D14 | Data source for the "review not run yet" state | A: client, from `usePrReviews` (already loaded by DiffTab) · B: a new field in `SmartDiffResponse` | A — no contract change, no vendored-copy mirror, and it uses the same "latest `kind='review'`" rule as the cards | S23, S24 |
| D15 | How counters refresh after a run finishes on another tab | A: page-level hook watching the `pr-active-runs` count go from ≥1 to 0 · B: move `RunStatus` SSE up to the page · C: DiffTab observes active runs | A — the query is already polled at page level and stays mounted on every tab. The review row is persisted before the run is marked done. FindingsTab is untouched | S20 |
| D16 | Toggle counter | A: `(comments + findings)` · B: comments only | A — the toggle now hides both kinds of item | S18, S24 |
| D17 | Where the sticky offset comes from | A: `PrDetailHeader` takes a `ref`; a new `_hooks/useElementHeight` hook + `page.tsx` measure it and set `--pr-header-h` on the content wrapper · A′: `PrDetailHeader` measures itself (ResizeObserver in a `useEffect`) and sets `--pr-header-h` on its parent element · B: a hard-coded pixel offset · C: no sticky header | **A′ — user decision 2026-09-27.** Same measurement as A, but one file: no `_hooks/` folder, no `page.tsx` change. B would overlap because the header height varies (title wrap, merged banner) | S21, S25 |
| D18 | Where a multi-line finding is marked | A: bar + label on every rendered added line in `start_line…end_line`; the card under the last such line (mockup) · B: `start_line` only (starter's instruction) | **A — user decision 2026-09-26.** Deliberate deviation from the starter's "anchor to `start_line`", to match the mockup. `finding_lines` (dots, ●N) still come from `start_line`, so the server is unchanged | S26, S27 |
| D19 | The inline card | A: wrap the Agent runs `FindingCard` · B: an own card in `DiffTab/_components/InlineFinding/` built from `@devdigest/ui` primitives, matching the mockup | **B — user decision 2026-09-26 (S26 design change).** The starter allows "a simpler copy: severity, title, rationale, Accept / Dismiss". `FindingCard` stays untouched | S27 |

A plan with open rows here stays `draft`.

## Decisions recorded
2026-09-26 — the user accepted every recommendation ("так, погоджуюсь"):
D1-A · D2-A · D3-A · D4-A · D5-A · D6-A · D7-A · D8-A · D9-A · D10-A (colours and the tests/docs hints as proposed).
`e2e/README.md` → `tests` stays as the starter's rule order gives it, fixed in the S2 table.
Per D1-A, `specs/007-smart-diff.md` is written by `doc-writer` from this plan's Goal/AC before implementation starts.

2026-09-26 — correction round (user decisions, Status back to `draft`):
- **D11 — `package.json` → `wiring`** (user accepted the recommendation). It was `core`; the mockup shows it in Boilerplate, but a dependency/script change is a decision, not mechanical output.
- **D12 — extra generated files: add only `*.d.ts` to boilerplate** (user accepted the recommendation). `vendor/` was considered and **rejected**: `*/src/vendor/shared` holds the Zod contracts, which must not be collapsed as "skim". `go.sum`, `poetry.lock` (already caught by `.lock`), `*.pb.go`, `*_generated.go`, `node_modules/` — not added (not used in this TS/Node repo).


2026-09-26 — correction round 2 (P2/P3 review wishes, user-approved items 1–7): **D9 → B**. D14-A as the user preferred (no contract change). D13-C, D15-A, D16-A and D17-A are the planner's proposals made at the user's request; they are recorded here and the user may override them on review (D13-C changes the GitHub-comment default when findings exist, see Risks). No contract, schema or migration change in this round.

2026-09-26 — correction round 3 (design review against the "webhooks.ts" mockup): the user approved the S26 design change (own inline card, pill label, card inset, single ×) and **D18-A** (range marking as in the mockup). Recorded as D18-A and D19-B; implemented as S26 (diff-viewer) and S27 (card). S22 is merged into S27.

2026-09-27 — user answers on the open items of rounds 2–3:
- **D17 → A′** (measure inside `PrDetailHeader`, one file; S21 rewritten, no `_hooks/`, no `page.tsx` change).
- **D13-C** confirmed (one toggle state; content shown by default when the latest review has findings).
- **D16-A** confirmed (toggle count = comments + findings).
- **D15-A** confirmed, including its blind spot (a run shorter than one 4 s poll).
- **`vendor/` stays out of the boilerplate rule** confirmed (D12).
- The correction round is not yet closed by the user; Status stays `draft`.

## Prerequisites
- Docker/Postgres running for `server/test/smart-diff.it.test.ts`.
- No new dependencies. Glob matching is hand-written: `picomatch` is only a transitive dependency of `server`, and `path.matchesGlob` is only stable from Node 22.20.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1–S3 | shared contract + client mirror; reviewer-core classifier | — | `SmartDiffRole` has 5 values. reviewer-core exports `classifyFile`, `SMART_DIFF_ROLE_ORDER`, `SMART_DIFF_RULES`. Report the red test run from S2 |
| G2 | S4–S7 | server `modules/smart-diff` + container + `.it` | G1 | `GET /pulls/:id/smart-diff` (AC3 shape); `container.smartDiff` |
| G3 | S8–S11 | client: data hook, i18n, DiffTab helpers, grouping + toggle UI | G1 (may run parallel to G2 — no shared files) | `useSmartDiff(prId)` key `["reviews", prId, "smart-diff"]`; `DiffTab/helpers.ts` exports (S10); DiffTab props gain `repo`, `headSha` |
| G4 | S12–S14 | client: diff-viewer annotations, InlineFinding, DiffTab findings wiring | G3 | — |
| G5 | S15–S16 | reviewer-core (fix mode D11/D12) | — (may run parallel to G6/G7: different package, no shared file) | Red output of S15 pasted in the report |
| G6 | S17 | server `.it` test | — (parallel-safe) | — |
| G7 | S18–S21 | client: i18n, diff-viewer `showContent`, run-settled hook, sticky offset publisher | — (parallel-safe with G5/G6) | `DiffAnnotationApi.showContent?: boolean`; `useRefreshOnRunsSettled(prId, activeCount)`; `--pr-header-h` set by `PrDetailHeader` on its parent element (D17-A′); new keys `smartDiff.showComments/hideComments/reviewNotRun` |
| G8 | S23–S27 (S22 merged into S27) | client: DiffTab helpers + toggle + empty state, SmartDiffGroup sticky, diff-viewer ranges + pill label, own inline card with stub | G7 | — |

## Steps

### S1 — Extend `SmartDiffRole` to five roles; mirror to client  [Contract]
- **Files:**
  - `server/src/vendor/shared/contracts/brief.ts` (modify)
  - `client/src/vendor/shared/contracts/brief.ts` (modify, targeted mirror)
  - `server/test/contracts.test.ts` (modify)
- **Change:**
  - `SmartDiffRole = z.enum(['core','tests','wiring','docs','boilerplate'])`, with a one-line comment: "declaration order = display order".
  - Nothing else in the Smart Diff block changes (`pseudocode_summary` stays as is).
  - `contracts.test.ts` `it('SmartDiff …')` (107-118) also parses one group each with `role:'tests'` and `role:'docs'`, and asserts that `SmartDiffRole.parse('lockfile')` throws.
- **Layer / why here:** contracts change in `server/src/vendor/shared` first, then a hand mirror (CLAUDE.md). This is the one authorised vendor edit in the plan; the `*/src/vendor/**` do-not-touch rule yields to "contracts change in shared first" because the assignment requires this edit.
- **Skills to apply:** `zod`, `typescript-expert`
- **Practices:**
  - `z.enum` plus a `z.infer` type (both already exported).
  - Edit the client copy line by line, never `cp`.
- **Known gotchas:** root INSIGHTS "the two vendored shared copies are not actually in sync" (2026-09-17) — whole-file equality is red by design, so compare only the Smart Diff block.
- **Done when:**
  - `diff <(sed -n '/---- Smart Diff ----/,/---- Composed PR Brief/p' server/src/vendor/shared/contracts/brief.ts) <(sed -n '/---- Smart Diff ----/,/---- Composed PR Brief/p' client/src/vendor/shared/contracts/brief.ts)` prints nothing.
  - `cd server && pnpm typecheck && pnpm exec vitest run test/contracts.test.ts` passes.
  - `cd client && pnpm typecheck` passes.

### S2 — Table-driven `classifyFile` tests (written first, red)
- **Files:** `reviewer-core/test/smart-diff-classify.test.ts` (create)
- **Change:** an `it.each` table `[path, role, note]` that imports `classifyFile`, `SMART_DIFF_ROLE_ORDER` from `../src/index.js`. Rows:
  - **Mandatory (from the assignment):**
    - `__tests__/__snapshots__/x.snap` → boilerplate
    - `.claude/skills/security/SKILL.md` → wiring
    - `e2e/README.md` → tests — note: tests rule precedes docs; deliberate
  - **Boilerplate:**
    - `pnpm-lock.yaml`, `server/pnpm-lock.yaml`, `reviewer-core/package-lock.json`, `yarn.lock`, `Cargo.lock`
    - `dist/a.js`, `server/dist/app.js`, `build/x.js`
    - `src/__snapshots__/a.ts.snap`
    - `src/api.generated.ts`, `vendor/jquery.min.js`
    - `client/next-env.d.ts`, `src/types/global.d.ts` — `.d.ts` suffix (D12)
  - **Tests:**
    - `src/a.test.ts`, `src/a.test.tsx`, `server/test/reviews.it.test.ts`, `src/a.spec.ts`
    - `test/helpers.ts`, `client/tests/x.ts`, `src/__tests__/a.ts`
    - `e2e/specs/01-x.flow.json`
  - **Wiring:**
    - `src/index.ts`, `lib/index.js`
    - `package.json`, `client/package.json` — note: a dependency/script change is wiring, not boilerplate (D11)
    - `vitest.config.ts`, `client/next.config.mjs`
    - `tsconfig.json`, `server/tsconfig.build.json`
    - `.eslintrc.cjs`, `.env.example`
    - `docker-compose.yml`, `docker-compose.dev.yml`
    - `.github/workflows/ci.yml`
  - **Docs:**
    - `README.md`, `server/docs/architecture.md`, `docs/guide.txt`
    - `README`, `CHANGELOG.md`, `LICENSE`
  - **Core:**
    - `src/config.ts` — note: `*.config.*` does not match
    - `src/middleware/ratelimit.ts`
    - `src/testing.ts`, `src/tests-utils/a.ts` — exact segment only
    - `docs-site/app.ts`, `src/build-info.ts`, `notes.mdx`
    - `server/src/vendor/shared/contracts/brief.ts` — note: `vendor/` is not a boilerplate rule; contracts must stay reviewable (D12)
  - **Order and purity:**
    - `SMART_DIFF_ROLE_ORDER` equals `['core','tests','wiring','docs','boilerplate']` and covers every `SmartDiffRole.options` value.
    - Calling it twice with the same path gives the same result.
- **Layer / why here:** unit tests for pure core logic (reviewer-core tests live in `reviewer-core/test/`).
- **Skills to apply:** `typescript-expert`
- **Practices:**
  - One `it.each` table, with the reason for each deliberate choice in the `note` column.
  - No mocks: the function is pure.
- **Known gotchas:** none.
- **Done when:** `cd reviewer-core && npm test -- smart-diff` **fails** with a missing export or module (red). Paste that output into the G1 handoff.

### S3 — Implement `classifyFile` + constants; export them
- **Files:**
  - `reviewer-core/src/smart-diff/constants.ts` (create)
  - `reviewer-core/src/smart-diff/classify.ts` (create)
  - `reviewer-core/src/index.ts` (modify)
- **Change:**
  - `constants.ts`:
    - `SMART_DIFF_ROLE_ORDER = ['core','tests','wiring','docs','boilerplate'] as const satisfies readonly SmartDiffRole[]` — the display order.
    - `SMART_DIFF_RULES: readonly SmartDiffRule[]` — the evaluation order, first match wins: boilerplate → tests → wiring → docs, and `core` as the fallback.
    - `SmartDiffRule = { role, basenames?, basenameSuffixes?, basenamePrefixes?, basenameIncludes?, segments?, prefixSuffix? }`. Matcher data per role:
      - **boilerplate:**
        - suffix `.lock`, `.snap`, `.min.js`, `.d.ts`
        - basename `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`
        - includes `.generated.`
        - segments `dist`, `build`, `__snapshots__`
      - **tests:**
        - suffix `.test.ts`, `.test.tsx`, `.spec.ts`
        - segments `test`, `tests`, `__tests__`, `e2e`
      - **wiring:**
        - basename `index.ts`, `index.js`, `package.json`
        - includes `.config.`
        - prefix+suffix `tsconfig`/`.json`, `docker-compose`/`.yml`
        - prefix `.eslintrc`, `.env`
        - segments `.github`, `.claude`
      - **docs:**
        - suffix `.md`
        - segment `docs`
        - prefix `README`, `CHANGELOG`
        - basename `LICENSE` or prefix `LICENSE.`
  - `classify.ts`: `classifyFile(path: string): SmartDiffRole`.
    - Strip one leading `./`, then split on `/`.
    - basename = the last part; directory segments = every part except the last (D8: any depth).
    - Return the first rule that matches, otherwise `'core'`.
    - Case-sensitive (assumption).
  - `index.ts`: export `classifyFile`, `SMART_DIFF_ROLE_ORDER`, `SMART_DIFF_RULES`, `type SmartDiffRule`, under a `// Smart Diff (L03)` comment.
- **Layer / why here:** Core (D2-A). A pure function over strings.
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:**
  - `import type { SmartDiffRole } from '@devdigest/shared'` — type-only.
  - No `node:path`, `fs`, `fetch` or `process.env`; plain string operations only.
  - The rules are data in `constants.ts`, not branches in `classify.ts`, so a later prompt filter can reuse them.
  - `satisfies` keeps the literal types.
- **Known gotchas:** reviewer-core "the only I/O allowed under src is the fetch in OpenRouterProvider.listModels()" — check with `\bfetch\(` and `process\.env`, not with imports alone.
- **Done when:**
  - `cd reviewer-core && npm run typecheck && npm test` passes (S2 now green).
  - `rg -n "from '(node:|fs|path|http)|\bfetch\(|process\.env" reviewer-core/src/smart-diff` returns nothing.

### S4 — Pure `buildSmartDiff` helper + unit test
- **Files:**
  - `server/src/modules/smart-diff/helpers.ts` (create)
  - `server/test/smart-diff-helpers.test.ts` (create)
- **Change:** `buildSmartDiff(files: {path; additions; deletions}[], findings: {file; startLine; dismissedAt: Date|null}[]): SmartDiffResponse`.
  1. Classify each file with `classifyFile`.
  2. `finding_lines` = the sorted, unique `startLine` values of that file's findings where `dismissedAt === null` (D4).
  3. Groups follow `SMART_DIFF_ROLE_ORDER`; empty groups are omitted (D5); files inside a group are sorted by path (D6).
  4. `split_suggestion = { too_big: false, total_lines: Σ(additions+deletions), proposed_splits: [] }`.
  5. A finding whose file is not in the PR is ignored.

  The test covers: role order, omitted empty groups, sorting, dedupe, dismissed findings excluded, `total_lines`, ignored unknown files, and an empty PR → `groups: []`.
- **Layer / why here:** module-local pure helper (onion: application-side, no DB).
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:**
  - Imports come only from `@devdigest/reviewer-core` and `@devdigest/shared` types; no `drizzle-orm` and no `db/schema`.
  - The input types are narrow structural types, not `FindingRow`, so the helper stays DB-agnostic.
- **Known gotchas:** none.
- **Done when:** `cd server && pnpm typecheck && pnpm exec vitest run test/smart-diff-helpers.test.ts` passes.

### S5 — `SmartDiffRepository`
- **Files:** `server/src/modules/smart-diff/repository.ts` (create)
- **Change:** `class SmartDiffRepository { constructor(db: Db) }` with three methods:
  - `getPull(workspaceId, prId): Promise<PullRow | undefined>` — `and(eq(workspaceId), eq(id))`.
  - `getPrFiles(prId)` — select `path`, `additions`, `deletions` only; no `patch`.
  - `latestReviewFindings(prId): Promise<{file; startLine; dismissedAt}[]>`:
    1. Select the `reviews.id` where `prId` matches and `kind = 'review'`, `orderBy(desc(createdAt))`, `limit(1)`.
    2. If there is none → `[]`.
    3. Otherwise select `file`, `startLine`, `dismissedAt` from `findings` where `reviewId` matches.
- **Layer / why here:** infrastructure — the only file in the module that touches `db/schema` and `drizzle-orm`. It uses the existing `reviews_pr_idx` and `findings_review_idx` (`schema/reviews.ts:37,64`), so no migration is needed.
- **Skills to apply:** `drizzle-orm-patterns`, `onion-architecture`, `postgresql-table-design`
- **Practices:**
  - Workspace scoping goes through the PR row, as `intent/repository.ts:50-59` does.
  - Select only the columns that are needed.
  - Return plain rows, not query builders.
  - Do not import `reviews/repository` from another module.
- **Known gotchas:** server "A foreign-key column carries no index of its own" — already covered by the two indexes above; add none.
- **Done when:** `cd server && pnpm typecheck` passes.

### S6 — `SmartDiffService` + container getter
- **Files:**
  - `server/src/modules/smart-diff/service.ts` (create)
  - `server/src/platform/container.ts` (modify)
- **Change:**
  - `service.ts`:
    - `interface SmartDiffServiceDeps { repo: Pick<SmartDiffRepository, 'getPull'|'getPrFiles'|'latestReviewFindings'> }`.
    - `class SmartDiffService { get(workspaceId, prId): Promise<SmartDiffResponse | undefined> }`. It returns `undefined` when the PR is not found, otherwise `buildSmartDiff(files, findings)`, with files and findings loaded via `Promise.all`.
  - `container.ts`:
    - add `private _smartDiff?: SmartDiffService`;
    - add `get smartDiff()`, which builds `new SmartDiffService({ repo: new SmartDiffRepository(this.db) })`, with a doc comment mirroring `get intent()` (152-168).
- **Layer / why here:** application service over a narrow port; the composition root binds it (plan 01 D10-A precedent).
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:**
  - The service never imports `drizzle-orm`, `db/schema` or `Container`.
  - The constructor takes deps only.
  - The container getter is the only place that knows both the service and its repository.
- **Known gotchas:** root INSIGHTS "depcruise gate … not real" — verify with `rg`, not `npm run depcruise`.
- **Done when:**
  - `cd server && pnpm typecheck` passes.
  - `rg -n "drizzle-orm|db/schema|platform/container" server/src/modules/smart-diff/service.ts server/src/modules/smart-diff/helpers.ts` returns nothing.

### S7 — Route, module registration, `.it` test
- **Files:**
  - `server/src/modules/smart-diff/routes.ts` (create)
  - `server/src/modules/index.ts` (modify)
  - `server/test/smart-diff.it.test.ts` (create)
- **Change:**
  - `routes.ts`: `GET /pulls/:id/smart-diff` with `{ schema: { params: IdParams, response: { 200: SmartDiffResponse } } }`. The handler:
    1. calls `getContext`;
    2. calls `app.container.smartDiff.get(workspaceId, req.params.id)`;
    3. throws `NotFoundError('Pull request not found')` on `undefined`.
    The header comment names the endpoint and D3/D4.
  - `index.ts`: import `smartDiff` from `./smart-diff/routes.js` and add it to `modules`.
  - `smart-diff.it.test.ts`: follows the `intent.it.test.ts` setup (`startPg`, `seed`, `isolatedTestConfig()`, `dockerAvailable` skip).
    - **Setup:**
      - Insert a repo and a PR.
      - Insert `pr_files`: `src/limiter.ts`, `src/limiter.test.ts`, `vitest.config.ts`, `src/index.ts`, `README.md`, `pnpm-lock.yaml`.
      - Insert an older `kind='review'` review with a finding on `src/index.ts`.
      - Insert a newer `kind='summary'` review with a finding.
      - Insert the newest `kind='review'` review, with explicit `createdAt` values, and these findings: two on `src/limiter.ts` (lines 12 and 12), one on `src/limiter.test.ts` (line 3), and one dismissed on `README.md`.
    - **Assertions:**
      - Group roles equal `['core','tests','wiring','docs','boilerplate']`.
      - `src/limiter.ts.finding_lines` = `[12]`.
      - `src/index.ts.finding_lines` = `[]`, because it is not in the latest review.
      - `README.md.finding_lines` = `[]`, because its finding is dismissed.
      - The lockfile is in boilerplate.
      - `total_lines` = the sum.
      - An unknown uuid → 404, and a PR of another workspace → 404.
- **Layer / why here:** transport; the route only validates, calls the service and maps errors.
- **Skills to apply:** `fastify-best-practices`, `zod`, `onion-architecture`, `security`
- **Practices:**
  - Params and response schemas are Zod, declared in the route options; there is no `.parse` in the handler.
  - No DB or schema imports in `routes.ts`.
  - Workspace scoping comes from `getContext`, never from a client value.
- **Known gotchas:**
  - server "A hermetic `.it` test must not be able to reach a real API key" — use `isolatedTestConfig()`; this route calls no LLM, so pass no llm override but keep the isolated config.
  - server "`MockGitHubClient` lists exactly one hard-coded PR" — insert the PR rows directly; do not rely on `GET /pulls/:id` refreshing them.
- **Done when:**
  - `cd server && pnpm typecheck` passes.
  - `cd server && pnpm exec vitest run test/smart-diff.it.test.ts test/routes-smoke.test.ts` is green (Postgres up).
  - `rg -n "db/schema|drizzle-orm" server/src/modules/smart-diff/routes.ts` returns nothing.

### S8 — `useSmartDiff` hook + run-done invalidation
- **Files:**
  - `client/src/lib/hooks/smart-diff.ts` (create)
  - `client/src/lib/hooks/index.ts` (modify)
  - `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` (modify)
- **Change:**
  - `smart-diff.ts`: `useSmartDiff(prId)` = `useQuery({ queryKey: ["reviews", prId, "smart-diff"], queryFn: () => api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`), enabled: !!prId })`. A header comment explains that the `["reviews", prId]` prefix makes the existing invalidations cover it: `useRunReview`, `useFindingAction`, `useDeleteReview` and `useDeleteRun` (`hooks/reviews.ts:61-157`).
  - `index.ts`: `export * from "./smart-diff";`
  - `page.tsx`, in the FindingsTab `onRunDone` (173-177): add `if (prId) qc.invalidateQueries({ queryKey: ["reviews", prId, "smart-diff"] });`. This is needed because `refetchReviews()` refetches only the exact key, and `staleTime` is 30 s (`lib/providers.tsx:28`).
- **Layer / why here:** data layer — one hook per endpoint (client/AGENTS.md).
- **Skills to apply:** `react-best-practices`, `next-best-practices`, `frontend-architecture`
- **Practices:**
  - No `fetch` in components.
  - Types come from `@devdigest/shared`.
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm typecheck` passes.

### S9 — i18n keys
- **Files:** `client/messages/en/prReview.json` (modify, `smartDiff` namespace only)
- **Change:**
  - **Existing keys:** keep them. Change `coreLabel` → `"Core logic"`; the namespace is unused today, and the mockup label is "Core logic".
  - **Group labels and hints:**
    - `testsLabel` "Tests", `docsLabel` "Docs"
    - `coreHint` "The substance of the change — review closely"
    - `testsHint` (D10)
    - `wiringHint` "Hooks the core into the app"
    - `docsHint` (D10)
    - `boilerplateHint` "Generated / mechanical — skim"
  - **Header and toggle:**
    - `header` "Reviewer-ordered diff"
    - `summary` "{count} files · +{additions} −{deletions}"
    - `orderLabel` "Diff order", `smartOrder` "Smart order", `originalOrder` "Original order"
  - **Finding markers:**
    - `filesWithFindings` "{count} files with findings" (aria-label for ●N)
    - `hasFindings` "Has findings" (aria-label for the file dot)
    - `lineLabel` { `CRITICAL` "blocker", `WARNING` "warning", `SUGGESTION` "suggestion" }
    - `unanchoredFindings` "Findings outside the shown diff"
    - `closeFinding` "Close finding"
  - **States:** `loading` "Ordering files…", `unavailable` "Smart order unavailable — showing original order"
- **Layer / why here:** copy lives in the feature namespace (client/AGENTS.md).
- **Skills to apply:** `next-best-practices`
- **Practices:**
  - Each UI state gets distinct copy.
  - Keep existing keys valid JSON; do not touch other namespaces.
- **Known gotchas:** client "`getByText` finding multiple matches … usually a copy bug" — `summary` must not reuse the `filesCount` wording.
- **Done when:** `jq '.smartDiff | keys' client/messages/en/prReview.json` lists `testsLabel` and `docsLabel` · `cd client && pnpm typecheck` passes.

### S10 — DiffTab pure helpers + role metadata
- **Files:**
  - `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/helpers.ts` (create)
  - `.../DiffTab/constants.ts` (create)
  - `.../DiffTab/helpers.test.ts` (create)
- **Change:**
  - `constants.ts`: `ROLE_META: Record<SmartDiffRole, { labelKey; hintKey; color; defaultOpen }>`. `defaultOpen` is false for `docs` and `boilerplate`; colours per D10.
  - `helpers.ts`:
    - `joinGroups(groups: SmartDiffGroup[], files: PrFile[]): { role; files: PrFile[]; findingFileCount: number }[]`:
      - joins on path and keeps the route's order;
      - `findingFileCount` = the number of files with `finding_lines.length > 0`;
      - PR files missing from the route are appended to a `core` group, created if absent (assumption: never drop a file).
    - `markedPaths(groups): Set<string>`.
    - `latestReviewFindings(reviews: ReviewRecord[] | undefined): FindingRecord[]` = `reviews?.find(r => r.kind === "review")?.findings ?? []`. The server orders newest-first (`review.repo.ts:66`), which matches D3.
    - `diffTotals(files)` → `{ additions, deletions }`.
  - The test covers each helper, including the missing-file fallback and the 2-files/5-findings → 2 count.
- **Layer / why here:** framework-agnostic rules → plain functions colocated with the only consumer (frontend-architecture).
- **Skills to apply:** `frontend-architecture`, `typescript-expert`
- **Practices:**
  - Pure functions, no React imports.
  - Types come from `@devdigest/shared`.
  - Colours use existing CSS vars only.
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm typecheck && pnpm test -- DiffTab/helpers` passes.

### S11 — Grouped view + order toggle in DiffTab
- **Files:**
  - `.../DiffTab/_components/DiffOrderToggle/{DiffOrderToggle.tsx,index.ts}` (create)
  - `.../DiffTab/_components/SmartDiffGroup/{SmartDiffGroup.tsx,styles.ts,index.ts}` (create)
  - `.../DiffTab/DiffTab.tsx` (modify)
  - `.../DiffTab/styles.ts` (create — added 2026-09-26, plan change, see Verification log)
  - `.../DiffTab/DiffTab.test.tsx` (create)
  - `page.tsx` (modify: pass `repo={repo}` and `headSha={pr.head_sha}` to DiffTab, for S14)
- **Change:**
  - **`DiffOrderToggle`:**
    - `{ value: "smart"|"original"; onChange }`.
    - A `div role="radiogroup" aria-label={t("smartDiff.orderLabel")}` containing two `button role="radio" aria-checked`.
  - **`SmartDiffGroup`:**
    - Props: `{ role; files: PrFile[]; findingFileCount; commenting?; annotations? }`.
    - Local `open` state, initialised from `ROLE_META[role].defaultOpen`.
    - Header `button` with `aria-expanded` and `aria-controls={bodyId}` (`React.useId`), containing: a chevron, a coloured square, the label, the muted hint, and on the right `{findingFileCount > 0 && <dot + count aria-label=filesWithFindings>}` followed by `filesCount`.
    - The body renders `<DiffViewer files={files} commenting={commenting} />` only while open. The `annotations` prop is passed through once S12 adds it.
  - **`DiffTab`:**
    - Props: `{ prId, filesCount, files, canComment, repo?, headSha? }`.
    - `const [order, setOrder] = useState<"smart"|"original">("smart")` (D7).
    - Calls `useSmartDiff(prId)`.
    - The `SectionLabel` shows `smartDiff.header` and `summary`; its right side holds the existing Show-comments button plus `DiffOrderToggle`.
    - Smart order: loading → `smartDiff.loading`; error → `smartDiff.unavailable`, then the original list; otherwise one `SmartDiffGroup` per group from `joinGroups`.
    - Original order renders `<DiffViewer files={files} …/>`, unchanged.
  - **`DiffTab.test.tsx`:** use `fireEvent` and `NextIntlClientProvider` with `{ prReview, shell }` messages. `vi.mock("@/lib/hooks/reviews", async (orig) => ({ ...(await orig()), usePrComments, useCreatePrComment }))` and `vi.mock("@/lib/hooks/smart-diff", …)`. Flow 1:
    1. The groups appear in order.
    2. Docs and Boilerplate have `aria-expanded="false"`.
    3. Clicking Boilerplate reveals `pnpm-lock.yaml`.
    4. The header shows ●2.
    5. Clicking the "Original order" radio sets `aria-checked`, and the files render in the `files` prop order with no group headers.
- **Layer / why here:** presentational components colocated under their only consumer (the nested `_components` precedent is `SettingsView/_components/`). DiffTab is the container.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `react-testing-library`, `next-best-practices`
- **Practices:**
  - Derive, don't store: groups and totals are computed during render; no `useEffect`.
  - Each component is ≤200 lines and has ≤7 props.
  - Keys are paths and roles, never indexes.
  - Use `count > 0 &&`, never a bare `count &&`.
  - Icon-only controls get an `aria-label`.
  - Styles live in `styles.ts`.
  - `"use client"`.
- **Known gotchas:**
  - client "no `@testing-library/user-event` — use `fireEvent`".
  - client "`vi.mock` of a hooks barrel … spread `importActual`".
  - client "four-sides longhand" if the group header has a one-sided border.
- **Done when:** `cd client && pnpm typecheck && pnpm test -- DiffTab` passes.

### S12 — Finding-agnostic line annotations in diff-viewer
- **Files:** `client/src/components/diff-viewer/`:
  - `annotations.ts` (create)
  - `index.ts`, `DiffViewer/DiffViewer.tsx`, `FileCard/FileCard.tsx`, `CodeLine/CodeLine.tsx`, `styles.ts` (modify)
  - `FileCard/FileCard.test.tsx` (create)
- **Change:**
  - `annotations.ts`:
    - `DiffLineAnnotation = { id; path; line /* RIGHT, new side */; color; label; content: React.ReactNode }`.
    - `DiffAnnotationApi = { items: DiffLineAnnotation[]; markedPaths: ReadonlySet<string>; markerLabel: string; unanchoredTitle: string }`.
    - `partitionAnnotations(items, renderedKeys)` → `{ matched: Map<key, DiffLineAnnotation[]>, unanchored }`, keyed by `lineKey("RIGHT", line)` and modelled on `partitionThreads`.
  - `DiffViewer` and `FileCard` take `annotations?: DiffAnnotationApi`.
  - `FileCard`:
    - the header shows a dot `var(--crit)` with `aria-label={markerLabel}` beside the path when `markedPaths.has(file.path)`. It is separate from the MessageSquare counter.
    - its body passes the matched items to `CodeLine`, and renders unanchored items under `unanchoredTitle` after `OutdatedComments`.
  - `CodeLine` takes `annotations: DiffLineAnnotation[]`. When the list is non-empty:
    - the row gets a left bar in `annotations[0].color` via `boxShadow: inset 3px 0 0 <color>` (assumption; it avoids border shorthand), plus a right-aligned label span;
    - `annotations.map(a => <React.Fragment key={a.id}>{a.content}</React.Fragment>)` renders below the row.
  - `index.ts` exports the types.
  - `FileCard.test.tsx` covers: the dot, the bar label on the matched line, content below it, and an unanchored item under its title.
- **Layer / why here:** shared chrome in `src/components/` must not import route-private `_components/FindingCard`. Content is injected as elements (data), not render functions.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `react-testing-library`
- **Practices:**
  - No imports from `app/**` or `FindingRecord` inside `diff-viewer`.
  - No render factories: the slot is `ReactNode`, never a camelCase function.
  - The existing comment behaviour is unchanged when `annotations` is undefined.
- **Known gotchas:** client "four-sides longhand" — if a border is used instead of `boxShadow`, write all four sides longhand.
- **Done when:**
  - `cd client && pnpm typecheck && pnpm test -- diff-viewer` passes.
  - `rg -n "_components|FindingCard|FindingRecord" client/src/components/diff-viewer` returns nothing.

### S13 — `InlineFinding` (FindingCard + close ×)
- **Files:** `.../DiffTab/_components/InlineFinding/{InlineFinding.tsx,styles.ts,index.ts,InlineFinding.test.tsx}` (create)
- **Change:** `InlineFinding({ f, onAction, pending, repo, headSha })`:
  - local `closed` state (D9);
  - renders `<FindingCard f={f} defaultExpanded onAction={onAction} pending={pending} repo={repo} headSha={headSha} />` plus a × `button aria-label={t("smartDiff.closeFinding")}`;
  - `null` once closed.
  - **Superseded by S22 (D9-B, 2026-09-26):** the × no longer returns `null`; it collapses the card into a stub.

  The test covers: the title and "SUGGESTED FIX" text render; Dismiss calls `onAction("dismiss")`; × removes the card.
- **Layer / why here:** route-colocated; it reuses the sibling `_components/FindingCard` via a relative import (`../../../FindingCard`).
- **Skills to apply:** `react-best-practices`, `react-testing-library`
- **Practices:**
  - FindingCard is not modified.
  - `fireEvent`.
  - A dismissed finding renders muted (FindingCard's own style) (D4).
- **Known gotchas:** client "fireEvent"; client "four-sides longhand" for the card wrapper.
- **Done when:** `cd client && pnpm test -- InlineFinding` passes.

### S14 — Wire findings into DiffTab
- **Files:**
  - `.../DiffTab/DiffTab.tsx` (modify)
  - `.../DiffTab/helpers.ts` (modify)
  - `.../DiffTab/DiffTab.test.tsx` (modify)
- **Change:**
  - `helpers.ts`: add `toAnnotations(findings, t, render)`. It is pure and returns `DiffLineAnnotation[]`:
    - one annotation per finding, with `line = start_line`, `color = severityColor(sev)` and `label = t(`smartDiff.lineLabel.${sev}`)`;
    - for undismissed findings only, the bar and label entries are sorted by `SEVERITY_LEVELS` index (D4); dismissed findings keep an entry, with their card only.
  - `DiffTab`:
    - `usePrReviews(prId)` and `useFindingAction()`;
    - `const findings = latestReviewFindings(reviews)`;
    - builds `annotations: DiffAnnotationApi` with `content: <InlineFinding … onAction={(a) => action.mutate({ findingId: f.id, action: a, prId })} pending={action.isPending && action.variables?.findingId === f.id} />`, `markedPaths` from S10 and the i18n titles;
    - passes it next to `commenting` in both orders.
  - The test adds flow 2: in a file with a CRITICAL finding on line 12:
    1. The file dot shows.
    2. The inline card is under line 12 with the label "blocker".
    3. Dismiss calls `mutate` with `{ findingId, action: "dismiss", prId }`.
    4. In Original order the card still renders.
- **Layer / why here:** container component composes the data hooks and injects the UI slot.
- **Skills to apply:** `react-best-practices`, `react-testing-library`, `frontend-architecture`
- **Practices:**
  - Derived during render (no state copies of findings).
  - Mock the hooks with an `importActual` spread.
  - DiffTab stays ≤200 lines: move annotation building into helpers.
- **Known gotchas:**
  - client "`vi.mock` of a hooks barrel … spread importActual" — FindingCard and InlineFinding sit under DiffTab.
  - root "TS2719 … fixture factory" if a `FindingRecord` fixture lacks new keys.
- **Done when:**
  - `cd client && pnpm typecheck && pnpm test` passes (whole suite; FindingsTab and FindingCard tests stay green — AC8).

### S15 — D11/D12 classify rows, red first (fix mode)
- **Files:** `reviewer-core/test/smart-diff-classify.test.ts` (modify)
- **Change:** add these rows to the existing `it.each` table:
  - `package.json` → wiring — note "D11: dependency/script change is a decision"
  - `client/package.json` → wiring — note "D11 at depth"
  - `client/next-env.d.ts` → boilerplate — note "D12"
  - `src/types/global.d.ts` → boilerplate — note "D12"
  - `lib/index.d.ts` → boilerplate — note "D12: boilerplate is evaluated before wiring"
  - `server/src/vendor/shared/contracts/brief.ts` → core — note "D12: vendor/ is not a boilerplate rule" (add it only if it is not already in the table)
- **Layer / why here:** unit tests for pure core logic.
- **Skills to apply:** `typescript-expert`
- **Practices:** extend the one table; no new `describe`; each row carries its reason in `note`; no mocks.
- **Known gotchas:** none.
- **Done when:** `cd reviewer-core && npm test -- smart-diff` **fails**, and only on the five D11/D12 `package.json`/`.d.ts` rows (the vendor row already passes through the `core` fallback). Paste the failing output into the G5 report.

### S16 — D11/D12 constants (fix mode)
- **Files:** `reviewer-core/src/smart-diff/constants.ts` (modify)
- **Change:**
  - wiring `basenames` gets `'package.json'` (today `['index.ts','index.js']`);
  - boilerplate `basenameSuffixes` gets `'.d.ts'` (today `['.lock','.snap','.min.js']`);
  - no other rule changes.
- **Layer / why here:** Core; rules are data, not branches (S3).
- **Skills to apply:** `onion-architecture`, `typescript-expert`
- **Practices:** `classify.ts` does not change; the literal types are kept (`satisfies`); no I/O.
- **Known gotchas:** reviewer-core purity — check it with `\bfetch\(` and `process\.env`, not only with imports.
- **Done when:**
  - `cd reviewer-core && npm run typecheck && npm test` passes.
  - `rg -n "from '(node:|fs|path|http)|\bfetch\(|process\.env" reviewer-core/src/smart-diff` returns nothing.
  - `cd server && pnpm exec vitest run test/smart-diff-helpers.test.ts` still passes.

### S17 — `.it`: grouping works before the first review
- **Files:** `server/test/smart-diff.it.test.ts` (modify)
- **Change:**
  - Extract the repo + PR + `pr_files` insert from `setupPr` into `insertPrWithFiles(files)`. `setupPr` keeps calling it and then inserts its reviews, so its behaviour is unchanged.
  - New `it('groups files before any review exists, with empty finding_lines and no LLM call')`:
    1. Build the app with `buildApp({ config: isolatedTestConfig(), db, overrides: { llm: { openai: m1, anthropic: m2, openrouter: m3 } } })`, where `m1`/`m3` are `new MockLLMProvider('openai')` and `m2` is `new MockLLMProvider('anthropic')`.
    2. Insert `src/limiter.ts`, `src/limiter.test.ts`, `README.md`, `pnpm-lock.yaml`, and no reviews.
    3. Assert:
       - 200;
       - roles `['core','tests','docs','boilerplate']`;
       - every file's `finding_lines` is `[]`;
       - `split_suggestion.total_lines` = the sum;
       - `[m1,m2,m3].every(m => m.calls.length === 0)`;
       - `db.select().from(t.reviews).where(eq(t.reviews.prId, pr.id))` has length 0.
- **Layer / why here:** integration test for the transport → service → repository path.
- **Skills to apply:** `fastify-best-practices`, `drizzle-orm-patterns`
- **Practices:**
  - `app.inject`; one flow per `it`; `await app.close()`.
  - Import `MockLLMProvider` from `../src/adapters/mocks.js` and `eq` from `drizzle-orm`, as `intent.it.test.ts` does.
- **Known gotchas:**
  - Server hermetic `.it`: `isolatedTestConfig()` plus a mock for every provider id (`openai`, `anthropic`, `openrouter`).
  - `MockGitHubClient` has one PR: insert the rows directly.
- **Done when:**
  - `cd server && pnpm typecheck` passes.
  - `cd server && pnpm exec vitest run test/smart-diff.it.test.ts` is green (Postgres up), 4 tests.

### S18 — i18n: toggle labels and empty state
- **Files:** `client/messages/en/prReview.json` (modify, `smartDiff` only)
- **Change:** add these keys:
  - `showComments` "Show comments ({count})"
  - `hideComments` "Hide comments ({count})"
  - `reviewNotRun` "Review not run yet — findings will appear here after Run Review"

  No such key exists today in any namespace. The button label matches `runReview.runReview` ("Run Review").
- **Layer / why here:** copy lives in the feature namespace.
- **Skills to apply:** `next-best-practices`
- **Practices:** valid JSON; existing keys untouched (`closeFinding` stays "Close finding").
- **Known gotchas:** client `getByText` multiple matches is usually a copy bug — `reviewNotRun` must not reuse the `loading`/`unavailable` wording.
- **Done when:** `jq -e '.smartDiff | has("showComments") and has("hideComments") and has("reviewNotRun")' client/messages/en/prReview.json` prints `true` · `cd client && pnpm typecheck`.

### S19 — diff-viewer: optional `showContent` on annotations
- **Files:** `client/src/components/diff-viewer/`:
  - `annotations.ts` (modify)
  - `FileCard/FileCard.tsx` (modify)
  - `CodeLine/CodeLine.tsx` (modify)
  - `FileCard/FileCard.test.tsx` (modify)
- **Change:**
  - `DiffAnnotationApi` gains `showContent?: boolean` ("when false, injected content is hidden; markers stay"; `undefined` = shown).
  - `CodeLine` gains `showAnnotationContent?: boolean` (default `true`). It gates only the `annotations.map(content)` block. The `marker` bar and label always render.
  - `FileCard`:
    - `const showContent = annotations?.showContent ?? true`;
    - passes it to `CodeLine`;
    - renders the unanchored block only when `showContent`;
    - the header dot is unchanged.
  - Test: new case `showContent: false` → the dot and the bar label are present, the injected content is absent, and the unanchored title is absent.
- **Layer / why here:** shared chrome stays finding-agnostic. The flag is named for content, not for findings.
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `react-testing-library`
- **Practices:**
  - `CodeLine` has ≤7 props (5 → 6).
  - No imports from `app/**`.
  - Behaviour is unchanged when `annotations` or `showContent` is undefined.
  - Styles stay in `styles.ts`.
- **Known gotchas:** client `fireEvent`.
- **Done when:**
  - `cd client && pnpm typecheck && pnpm exec vitest run diff-viewer` passes.
  - `rg -n "_components|FindingCard|FindingRecord" client/src/components/diff-viewer` returns nothing.

### S20 — Refresh reviews when active runs settle (page level)
- **Files:**
  - `client/src/lib/hooks/reviews.ts` (modify)
  - `client/src/lib/hooks/run-settled.test.tsx` (create)
  - `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` (modify)
- **Change:**
  - `reviews.ts`: add `useRefreshOnRunsSettled(prId: string | null | undefined, activeCount: number)`.
    - It uses `useQueryClient()` and a `useRef` holding the previous count.
    - In `useEffect([prId, activeCount])`: when `prId && prev > 0 && activeCount === 0`, it calls `qc.invalidateQueries({ queryKey: ["reviews", prId] })` and `qc.invalidateQueries({ queryKey: ["pr-runs", prId] })`, then stores `prev = activeCount`.
    - A doc comment names D15, explains that the prefix key covers `["reviews", prId, "smart-diff"]`, and says it fires on every tab.
  - `page.tsx`: one line after `liveRunIds`: `useRefreshOnRunsSettled(prId, liveRunIds.length);`.
    - `onRunDone` and FindingsTab stay unchanged; a double invalidation is harmless.
  - Test (`renderHook` with a `QueryClientProvider`, `vi.spyOn(qc, "invalidateQueries")`):
    - 0 → 1 does not fire;
    - 1 → 0 fires both keys once;
    - `prId` null does not fire.
- **Layer / why here:** data layer. This is query-cache behaviour for the reviews domain, next to `usePrActiveRuns`.
- **Skills to apply:** `react-best-practices`, `react-testing-library`, `next-best-practices`
- **Practices:**
  - The effect syncs with an external system (the server's run state), so `useEffect` is justified.
  - Dependencies are complete; no state is stored.
  - The signature of the existing hooks is unchanged.
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm typecheck && pnpm exec vitest run run-settled` passes.

### S21 — Publish the PR header height as `--pr-header-h` (D17-A′)
- **Files:** `.../pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx` (modify)
- **Change:**
  - A `ref` on the root `div` (`s.root`) and a `useEffect` that:
    - reads the root's `offsetHeight` on mount and writes it to `root.parentElement.style.setProperty("--pr-header-h", `${h}px`)`;
    - subscribes a `ResizeObserver` on the root and updates the variable on every size change;
    - on cleanup disconnects the observer and removes the property from the parent;
    - does nothing when `ResizeObserver` or `parentElement` is missing.
  - A short comment at the effect: the parent is the common ancestor of the header and the tab content, so the variable reaches the sticky SmartDiffGroup header (S25); why a measured height (title wrap, merged banner).
  - No change to `page.tsx`, no new hook file, no new props.
- **Layer / why here:** the header is the source of the height, so the measurement lives with it (D17-A′).
- **Skills to apply:** `react-best-practices`, `frontend-architecture`
- **Practices:**
  - The effect syncs with the DOM (an external system), so `useEffect` is justified; the cleanup disconnects the observer.
  - `PrDetailHeader` keeps its props and markup; its test stays green.
- **Known gotchas:** none. jsdom `ResizeObserver` is stubbed in `src/test/setup.ts:3-8`.
- **Done when:**
  - `cd client && pnpm typecheck && pnpm exec vitest run PrDetailHeader` passes.
  - `rg -n "pr-header-h" "client/src/app/repos/[repoId]/pulls/[number]/page.tsx"` returns nothing and `ls "client/src/app/repos/[repoId]/pulls/[number]/_hooks"` fails (no such folder).

### S22 — `InlineFinding`: × collapses to a stub (D9-B)
- **Merged into S27 (2026-09-26):** S27 rebuilds `InlineFinding` without `FindingCard` and carries this step's stub behaviour and tests. Do not implement S22 separately.
- **Files:** `.../DiffTab/_components/InlineFinding/{InlineFinding.tsx,styles.ts,InlineFinding.test.tsx}` (modify)
- **Change:**
  - `closed` becomes `collapsed` (local state).
  - Collapsed renders `<button type="button" aria-expanded={false} onClick={() => setCollapsed(false)} style={s.stub}>` containing `<SeverityBadge severity={f.severity as Severity} compact />` and `<span style={s.stubTitle}>{f.title}</span>`.
  - Expanded is unchanged: FindingCard plus the × (`aria-label smartDiff.closeFinding`), which sets `collapsed = true`.
  - Test (rewrite the × part of the existing flow):
    1. × → "Suggested fix" is gone, the title is still shown, and a button with `aria-expanded="false"` whose name contains the title exists.
    2. Clicking it → "Suggested fix" is back.
    3. Dismiss still calls `onAction("dismiss")`.
- **Layer / why here:** route-colocated. FindingCard is not modified.
- **Skills to apply:** `react-best-practices`, `react-testing-library`
- **Practices:**
  - Props stay 5.
  - ≤200 lines.
  - `SeverityBadge`/`Severity` come from `@devdigest/ui` (as FindingCard does).
  - Styles in `styles.ts` with each entry written out in full (no spread of a shared `CSSProperties` base — TS2742).
- **Known gotchas:** client `fireEvent`; four-sides longhand if the stub has a one-sided border (or use an inset `boxShadow`).
- **Done when:** `cd client && pnpm typecheck && pnpm exec vitest run InlineFinding` passes.

### S23 — Helper `reviewNotRun`
- **Files:** `.../DiffTab/helpers.ts` (modify), `.../DiffTab/helpers.test.ts` (modify)
- **Change:** `reviewNotRun(reviews: ReviewRecord[] | undefined): boolean` = `reviews !== undefined && !reviews.some((r) => r.kind === "review")` (D14). Tests: `undefined` → false · `[]` → true · only `kind:"summary"` → true · includes `kind:"review"` → false.
- **Layer / why here:** pure rule, colocated.
- **Skills to apply:** `frontend-architecture`, `typescript-expert`
- **Practices:** no React import.
- **Known gotchas:** none.
- **Done when:** `cd client && pnpm exec vitest run DiffTab/helpers` passes.

### S24 — DiffTab: shared toggle + empty state + i18n
- **Files:** `.../DiffTab/DiffTab.tsx` (modify), `.../DiffTab/styles.ts` (modify), `.../DiffTab/DiffTab.test.tsx` (modify)
- **Change:**
  - Replace the `showComments` state with `const [inlineChoice, setInlineChoice] = React.useState<boolean | null>(null)`.
    - `const showInline = inlineChoice ?? findings.length > 0` (D13).
    - `const toggleCount = commentCount + findings.length` (D16).
  - `commenting.showComments = showInline`; `onSubmit` success calls `setInlineChoice(true)`.
  - `annotations.showContent = showInline`.
  - Button:
    - renders when `toggleCount > 0`;
    - label `t(showInline ? "smartDiff.hideComments" : "smartDiff.showComments", { count: toggleCount })`;
    - icon unchanged;
    - `onClick={() => setInlineChoice(!showInline)}`.
  - Under `SectionLabel`: `{reviewNotRun(reviews) && <p style={s.reviewNotRun}>{t("smartDiff.reviewNotRun")}</p>}`.
  - `styles.ts`: add `reviewNotRun` (muted 13px, like `loading`, written out in full).
  - Tests:
    - add a `CURRENT_COMMENTS` variable to the `usePrComments` mock (`importActual` spread kept).
    - Flow 1 and flow 2 stay as they are. With D13, flow 2's card is visible by default.
    - **New flow 3 (toggle):** `CURRENT_REVIEWS=[review()]`:
      1. The button reads "Hide comments (1)" and the card is visible.
      2. Click → "Show comments (1)"; the card title is gone; "blocker", the file dot and ●2 are still present.
      3. Click → the card is back.
      4. Then with comments only (`CURRENT_REVIEWS=[]`, one comment): "Show comments (1)", hidden by default.
    - **New flow 4 (empty state):** `[]` → the `reviewNotRun` text is shown and there is no toggle button; `[review({kind:"summary"})]` → shown; `[review()]` → absent.
- **Layer / why here:** DiffTab is the container that owns the view state.
- **Skills to apply:** `react-best-practices`, `react-testing-library`, `next-best-practices`
- **Practices:**
  - Derive `showInline`/`toggleCount` during render; no `useEffect`.
  - `count > 0 &&`.
  - DiffTab ≤200 lines and ≤7 props (unchanged: 6).
  - No hard-coded copy.
- **Known gotchas:** client `fireEvent`; `importActual` spread; `getByText` multiple matches (the title appears in both card and stub — the query must pick the state being asserted).
- **Done when:**
  - `cd client && pnpm typecheck && pnpm exec vitest run DiffTab` passes.
  - `rg -n '"(Show|Hide) comments' "client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx"` returns nothing.

### S25 — Sticky SmartDiffGroup header
- **Files:** `.../DiffTab/_components/SmartDiffGroup/styles.ts` (modify)
- **Change:**
  - `wrap.overflow`: `"hidden"` → `"clip"`. `hidden` makes the wrapper a scroll container and disables sticky; `clip` still clips the rounded corners.
  - `header`: add `position: "sticky"`, `top: "var(--pr-header-h, 0px)"`, `zIndex: 2` (below PrDetailHeader's 5, above the InlineFinding × at 1), and `background: "var(--bg-surface)"` instead of `"transparent"`, so rows don't show through.
  - FileCard headers are not sticky, so nothing else overlaps.
- **Layer / why here:** presentation only.
- **Skills to apply:** `react-best-practices`
- **Practices:** each entry written out in full with `satisfies CSSProperties` (no base spread, TS2742).
- **Known gotchas:** none.
- **Done when:**
  - `rg -n 'position: "sticky"|overflow: "clip"|--pr-header-h' ".../SmartDiffGroup/styles.ts"` shows all three.
  - `cd client && pnpm typecheck && pnpm test` passes (whole suite, AC8).
  - AC20 manual.

### S26 — diff-viewer: range annotations + label pill (D18-A)
- **Files:** `client/src/components/diff-viewer/`:
  - `annotations.ts` (modify)
  - `CodeLine/CodeLine.tsx` (modify)
  - `FileCard/FileCard.tsx` (modify)
  - `styles.ts` (modify)
  - `FileCard/FileCard.test.tsx` (modify)
- **Change:**
  - `DiffLineAnnotation` gains `endLine?: number` (RIGHT side, inclusive; `undefined` = single line) and `icon?: React.ReactNode` (shown in the label pill).
  - `partitionAnnotations(items, renderedLines)` now takes the rendered lines (kind + `newNo`), not only keys. Per item:
    1. `marks` = rendered lines with `kind === "add"` and `newNo` in `line…(endLine ?? line)`;
    2. if `marks` is empty and `RIGHT:line` is rendered → `marks = [that line]`;
    3. if still empty → unanchored;
    4. otherwise the item is a **marker** on every key in `marks` and its **content** anchors on the last one.
    It returns `{ markers: Map<key, DiffLineAnnotation[]>, content: Map<key, DiffLineAnnotation[]>, unanchored }`.
  - `CodeLine` takes `markers` (bar + pill from the first with `color && label`) and `contents` (rendered below the row) separately; S19's `showAnnotationContent` gates `contents` only.
  - `styles.ts`: `annotationLabelFor(color)` becomes a pill: `display: inline-flex`, `alignItems: center`, `gap: 4`, `padding: "1px 8px"`, `borderRadius: 6`, 1px solid border in `color` (four-side longhand), background `color-mix(in srgb, <color> 12%, transparent)`, font 12px/500, lowercase (no `textTransform`), `marginRight: 12`. The icon renders before the text.
  - Test: a range annotation over lines 61–73 where 61, 68, 73 are `add` and 62 is context → three pills, no pill on 62, content once after 73; a range with only context lines rendered → marker + content on `start_line`; a range outside the patch → unanchored block.
- **Layer / why here:** shared chrome; still finding-agnostic (a generic line range + optional icon).
- **Skills to apply:** `frontend-architecture`, `react-best-practices`, `react-testing-library`
- **Practices:** no imports from `app/**`; behaviour unchanged for single-line items without `endLine`; styles stay in `styles.ts`; four-side longhand for the pill border.
- **Known gotchas:** client "four-sides longhand"; `fireEvent`.
- **Done when:**
  - `cd client && pnpm typecheck && pnpm exec vitest run diff-viewer` passes.
  - `rg -n "_components|FindingCard|FindingRecord" client/src/components/diff-viewer` returns nothing.

### S27 — Own inline finding card per the mockup (D19-B; includes S22's stub)
- **Files:**
  - `.../DiffTab/_components/InlineFinding/{InlineFinding.tsx,styles.ts,InlineFinding.test.tsx}` (modify)
  - `.../DiffTab/helpers.ts`, `.../DiffTab/helpers.test.ts` (modify)
  - `client/messages/en/prReview.json` (modify, `smartDiff` only)
- **Change:**
  - `InlineFinding({ f, onAction, pending })` no longer renders `FindingCard` (props 5 → 3; `repo`/`headSha` stay on DiffTab for now but are no longer passed — no forge link in the mockup).
    - **Header:** severity icon in a tinted 24px rounded square (`SEV[sev]` colour/bg via `severityColor`), the uppercase word `t("smartDiff.lineLabel.<SEV>")` with `textTransform: uppercase` (BLOCKER/WARNING/SUGGESTION), the title, `CategoryTag`; meta row `t("smartDiff.lineRange", { range })` (`range` from `lineLabel`-style `61` / `61-74`) + `ConfidenceNum`. A single × button (`aria-label smartDiff.closeFinding`) top-right; no chevron.
    - **Body:** `Markdown` rationale; SUGGESTED FIX box (`finding.suggestedFix` label, like FindingCard); Accept / Dismiss `Button`s with `active` reflecting `accepted_at` / `dismissed_at`; muted when accepted/dismissed.
    - **Collapsed (D9-B, from S22):** a `button` with `aria-expanded="false"`: the severity icon + word + title; click restores the card.
    - **Card box:** `margin: "6px 14px 8px 58px"`, `borderRadius: 8`, four-side longhand borders (1px `var(--border)`, left 3px severity colour), background `var(--bg-elevated)`.
  - `helpers.ts#toAnnotations`: pass `endLine = f.end_line` and `icon = <severity icon>` (as `DiffLineAnnotation["icon"]`, no `react` import in helpers — build the element in DiffTab's render callback and pass it in, or pass the icon component name and let the callback render it).
  - `prReview.json`: add `smartDiff.lineRange` "line {range}".
  - Tests: InlineFinding — the uppercase word, title, `line 61-74`, no file path, Dismiss → `onAction("dismiss")`, × → stub with `aria-expanded="false"` → click → card back, no chevron element; helpers — `endLine` carried.
- **Layer / why here:** route-colocated presentational component; `FindingCard` is not modified.
- **Skills to apply:** `react-best-practices`, `react-testing-library`, `frontend-architecture`
- **Practices:** ≤200 lines (split header/stub into local subcomponents if needed); styles in `styles.ts`, each entry written out in full (no base spread — TS2742); `fireEvent`.
- **Known gotchas:** client "four-sides longhand"; `getByText` multiple matches (title in card vs stub); `importActual` spread where hooks are mocked.
- **Done when:**
  - `cd client && pnpm typecheck && pnpm exec vitest run InlineFinding DiffTab` passes.
  - `rg -n "FindingCard" ".../DiffTab/_components/InlineFinding/InlineFinding.tsx"` returns nothing.
  - `cd client && pnpm test` passes (whole suite; `FindingCard.test.tsx` unchanged and green — AC8).

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `server/test/contracts.test.ts` | unit | 5-value `SmartDiffRole` | S1 |
| `reviewer-core/test/smart-diff-classify.test.ts` | unit (written first) | path → role table, order, purity | S2/S3 |
| `server/test/smart-diff-helpers.test.ts` | unit | grouping, finding_lines, D4–D6, totals | S4 |
| `server/test/smart-diff.it.test.ts` | .it (Postgres) | route shape, latest review only, 404 scoping | S7 |
| `DiffTab/helpers.test.ts` | client unit | join, counts, latest review, annotations | S10/S14 |
| `diff-viewer/FileCard/FileCard.test.tsx` | client RTL | dot, bar/label, unanchored fallback | S12 |
| `InlineFinding/InlineFinding.test.tsx` | client RTL | card, dismiss, close | S13 |
| `DiffTab/DiffTab.test.tsx` | client RTL | groups/collapse/toggle; inline findings | S11/S14 |
| Manual fork PR (AC10) | manual — needs sign-off | end-to-end in the browser | after G4 |
| `reviewer-core/test/smart-diff-classify.test.ts` | unit (new rows red first) | D11 `package.json` → wiring; D12 `.d.ts` → boilerplate; vendor → core | S15/S16 |
| `server/test/smart-diff.it.test.ts` | .it (Postgres) | no-review PR → groups, empty `finding_lines`, 0 LLM calls, 0 reviews | S17 |
| `diff-viewer/FileCard/FileCard.test.tsx` | client RTL | `showContent:false` keeps dot and bar, hides content and the unanchored block | S19 |
| `lib/hooks/run-settled.test.tsx` | client unit (renderHook) | invalidates reviews + pr-runs on 1 → 0 only | S20 |
| `InlineFinding/InlineFinding.test.tsx` | client RTL | × → stub → re-expand | S22 |
| `DiffTab/helpers.test.ts` | client unit | `reviewNotRun` | S23 |
| `DiffTab/DiffTab.test.tsx` | client RTL | shared toggle (D13 defaults, markers stay); empty state | S24 |
| Manual fork PR (AC20) | manual — needs sign-off | sticky header, refresh after run on another tab, toggle, empty state | after G8 |
| `diff-viewer/FileCard/FileCard.test.tsx` | client RTL | range markers on added lines only, content under the last one, fallbacks | S26 |
| `InlineFinding/InlineFinding.test.tsx` | client RTL | own card: word, title, `line X-Y`, no path, no chevron, × → stub → back, Dismiss | S27 |
| Manual fork PR (AC21/AC22) | manual — needs sign-off | card design vs the mockup; multi-line finding marks | after G8 |

## Migrations & contracts
- **Migrations:** none. The existing indexes `reviews_pr_idx` and `findings_review_idx` serve S5.
- **Contracts:** `SmartDiffRole` in `server/src/vendor/shared/contracts/brief.ts`, with a hand mirror into `client/src/vendor/shared/contracts/brief.ts` (S1, `[Contract]`), checked with a scoped diff. `SmartDiffResponse` is otherwise unchanged.
- **Correction round 2 (G5–G8):** no migration and no contract change. D14-A deliberately avoids a `SmartDiffResponse` field, so there is no edit to `server/src/vendor/shared` or its client mirror.

## Out of scope
- `pseudocode_summary` ("What this does" pill) — no LLM call; the field stays null.
- `split_suggestion` logic beyond `too_big:false` / `proposed_splits: []`.
- Using `classifyFile` as a pre-prompt filter in `reviewPullRequest` (a later lesson).
- Changing FindingCard, FindingsTab, the Agent runs tab, `usePrReviews`/`useFindingAction` signatures, or `pr_files` (no order column).
- Content-based barrel detection: `index.ts` is always classified as wiring.
- e2e flow; editing any `*/src/vendor/**` beyond the S1 contract pair. (The "Show comments" translation moved in scope: S18/S24.)
- Moving `RunStatus`/SSE out of FindingsTab, or changing `onRunDone` (D15-A only adds an observer).
- Persisting the toggle, the collapsed-stub state or the group open state across reloads. All are local state; a stub resets when its file or group remounts.
- Sticky FileCard headers.
- Splitting `page.tsx` (already 224 lines; this round adds one line).

<!-- implementer-brief:end -->

## Context applied
- `server/insights/gotchas.md`:
  - hermetic `.it` (S7);
  - MockGitHubClient returns one PR → insert rows directly (S7);
  - FK index (S5: existing indexes suffice);
  - enum text column has no SQL constraint (not relevant: `SmartDiffRole` is not persisted).
- `client/insights/gotchas.md` → fireEvent (S11–S14), importActual (S11, S14), four-sides longhand (S12, S13), distinct copy (S9).
- `reviewer-core/insights/gotchas.md` → purity check includes `fetch`/`process.env` (S3).
- Root `INSIGHTS.md`:
  - vendored copies drift → scoped diff (S1);
  - depcruise not real → `rg` edge checks (S6, S7, S12);
  - TS2719 fixture (S14);
  - `pr-self-review` map unreliable → contracts follow CLAUDE.md.

- Correction round 2:
  - `client/insights/gotchas.md`: `fireEvent` (S19, S22, S24); `importActual` spread (S24); four-sides longhand (S22); `getByText` multiple matches (S18, S24 — card vs stub title).
  - `server/insights/gotchas.md`: hermetic `.it` + every provider mocked (S17); MockGitHubClient one PR (S17).
  - `reviewer-core/insights/gotchas.md`: purity with `fetch`/`process.env` (S16).
  - Root `INSIGHTS.md`: vendored copies drift → D14-A avoids any contract edit.
  - From earlier implementer reports (not yet in gotchas files): no base-spread in `styles.ts` (TS2742) (S22, S24, S25); `pnpm exec vitest run <pattern>` for client filtering.

## Affected modules
| Package | Module / path | Layer | New / changed |
|---|---|---|---|
| shared | `contracts/brief.ts` (+ client mirror) | Ports | changed |
| reviewer-core | `src/smart-diff/{classify,constants}.ts`, `index.ts` | Core | new |
| server | `modules/smart-diff/{helpers,repository,service,routes}.ts` | App / Infra / Transport | new |
| server | `platform/container.ts`, `modules/index.ts` | Composition root | changed |
| client | `lib/hooks/smart-diff.ts`, `hooks/index.ts` | Data | new / changed |
| client | `components/diff-viewer/*` | Shared chrome | changed |
| client | `pulls/[number]/_components/DiffTab/**`, `page.tsx`, `messages/en/prReview.json` | Route UI | changed / new |

## Design notes
- **Data split:**
  - the route is the single source for grouping, order and finding presence (dots, ●N);
  - `usePrReviews` provides finding *details* for the inline cards.
  Both use the same "latest `kind='review'`" rule (server `orderBy desc` + `limit 1`; client `find(kind==='review')` on the newest-first list).
- **Cache invalidation:** the key `["reviews", prId, "smart-diff"]` is a prefix match of `["reviews", prId]`, so every existing invalidation covers it for free. Only page `onRunDone`, which uses exact `refetch()`, needs one added line.
- **Rule evaluation order vs display order:** rules are evaluated in the order boilerplate → tests → wiring → docs → core. That is why `.snap` inside `__tests__` is boilerplate and `e2e/README.md` is tests.

## Risks & open questions
- With D3-A, when several agents review a PR, only the newest agent's review drives dots and cards. B is a later option.
- When there is no forge token, `GET /pulls/:id` serves `pr_files` with no `ORDER BY` (`pulls/routes.ts:295`), so "Original order" is not guaranteed to be GitHub order offline. This is pre-existing and not fixed here.
- D8-A classifies a code folder named `build/` or `dist/` as boilerplate.
- A finding on a deleted-only line (LEFT side) has no RIGHT key and lands in the unanchored block. This is intended.
- The latest-review logic for the PR list is at `pulls/routes.ts:131-141` (researcher cited 161-168; the plan cites the code).
- The manual fork PR (AC10) cannot be automated — the plan-verifier should report it as *needs sign-off*.
- **D13-C changes existing behaviour:** GitHub comments on a PR with findings now start visible. If that is unwanted, the alternative is D13-A (always hidden; the demo needs one click).
- **D15-A blind spot:** a run shorter than one `pr-active-runs` poll (4 s) never produces a 1 → 0 transition. The mitigations are `useRunReview` invalidating at start and FindingsTab `onRunDone` when mounted. The review row is written before the run is marked done (`run-executor.ts:282` vs `:308`), so a detected transition always sees the new review.
- **Sticky (S21/S25):** it depends on no ancestor between `<main overflow:auto>` (`AppFrame.tsx:29`) and the group having `overflow` other than visible/clip, and on `PrDetailHeader`'s parent being a common ancestor of the tab content (D17-A′). Verified for `page.tsx:151` and DiffTab's `<section>`; `AppShell` was not opened in full. jsdom cannot scroll, so AC15 is covered by an `rg` check plus AC20 manual.
- **Hiding content** also unmounts `InlineFinding`, so a collapsed stub reopens expanded after hide → show. Accepted.
- **An unanchored-only finding** is marked only by the file dot while hidden (its block is content). Accepted.
- Earlier Done-whens (S10–S13) use `cd client && pnpm test -- <pattern>`, which does not filter; they still run (whole suite). New steps use `pnpm exec vitest run <pattern>`.
- `page.tsx` is already over 200 lines (224); S20 adds one line (S21 no longer touches it, D17-A′); the split stays out of scope.

## Handed off
- **architecture-reviewer:**
  - reviewer-core ← server alias use (S3/S4);
  - the container getter pattern (S6);
  - `diff-viewer` staying finding-agnostic (S12);
  - the nested `DiffTab/_components/` placement.
- **security review:** `routes.ts` — `IdParams` validation and workspace scoping through `getContext` + `getPull`. There is no outbound call, no raw SQL, and paths render as React-escaped text.
- **doc-writer (optional):** add `src/smart-diff/` to the `reviewer-core/AGENTS.md` Map; add the endpoint to `server/docs/architecture.md`.
- Correction round 2 → **architecture-reviewer:** `showContent` keeps `diff-viewer` finding-agnostic (S19); `useRefreshOnRunsSettled` placement in `lib/hooks/reviews.ts` (S20); `PrDetailHeader` writing `--pr-header-h` onto its parent element (S21, D17-A′). **Security review:** nothing new — the client renders only escaped text, and the server change is test-only.

## Insights to record
- `client/INSIGHTS.md` · Codebase Patterns — a query keyed under `["reviews", prId, …]` inherits every `invalidateQueries(["reviews", prId])`, but not the page's exact `refetchReviews()` (`hooks/reviews.ts:61-157`, `page.tsx:176`). Record this only if the implementation confirms it.
- Root `INSIGHTS.md` — dated correction: the 2026-09-18 FK-index entry's claim that `findings.reviewId` has no index is stale; `findings_review_idx` exists (`server/src/db/schema/reviews.ts:59-64`).

- Correction round 2 candidates (record only if confirmed during implementation):
  - `client/INSIGHTS.md` · Tool & Library Notes — `pnpm test -- <pattern>` does not filter in `client/`; use `pnpm exec vitest run <pattern>`.
  - `client/INSIGHTS.md` · What Doesn't Work — `overflow: hidden` on a wrapper makes `position: sticky` inside it inert (it creates a scroll container); use `overflow: clip` (`SmartDiffGroup/styles.ts:9`). Confirm in the browser.
  - `client/INSIGHTS.md` · Recurring Errors — TS2742 when a `styles.ts` entry spreads a separately typed `CSSProperties` base (evidence: `DiffOrderToggle/styles.ts`, G3 report).

## Verification log
### 2026-09-26 — first verification (after G1–G4)
- Full server `.it` suite (main session): 15 files / 109 tests passed.
- architecture-reviewer: **PASS**; F1 (MEDIUM) — "finding" naming in shared `diff-viewer` (`hasFindings`, `s.findingDot`).
- plan-verifier: **contradicted** — 103/116 met.
  - DC4 / S14.c — a line whose only finding is dismissed still shows the bar + label.
  - T5 — no `toAnnotations` unit test in `DiffTab/helpers.test.ts`.
  - D20 — S12 Done-when `rg` matches a comment in `FileCard.test.tsx:4`.
  - P11 — new inline style objects in `DiffTab.tsx` and `SmartDiffGroup.tsx`.
- Sent to implementer in fix mode: DC4, T5, D20, F1, P11 (SmartDiffGroup part only).
- Open: P11 for `DiffTab.tsx` needs a new `DiffTab/styles.ts`, outside every step's Files → a plan change awaiting the user's decision.
- Needs sign-off: AC1/D4 red-first run (implementer's G1 report shows 48/48 failed with `classifyFile is not a function`); AC10 manual fork PR; AC11 PR description; R3 plan-file baseline; R4 no Test Report.

### 2026-09-26 — plan change: `DiffTab/styles.ts`
- Change: S11 Files gains `.../DiffTab/styles.ts` (create). DiffTab's inline style objects (`DiffTab.tsx:86,102,110,113`) move there, closing the rest of P11.
- Plan returned to `draft` for this change. The user approved it explicitly ("Додай DiffTab/styles.ts"), so the status is back to `in-progress`. No other step or decision changed.

### 2026-09-26 — re-verification after fix mode
- Fix-mode runs closed DC4, T5, D20, F1 and P11 (SmartDiffGroup + DiffTab/styles.ts). Client: typecheck clean, 41 files / 339 tests.
- plan-verifier: **complete — needs sign-off**. No partial, missing or contradicted items; no unplanned changes.
- Awaiting the user's sign-off on: AC10 (manual fork PR), AC11 (PR description), D4 (S2 red-first run — evidence is the G1 report, 48/48 failed), R3 (plan file has no git baseline), R4 (no Test Report).
- Status stays `in-progress` until the user accepts these items.

### 2026-09-26 — plan change: all Smart order groups start collapsed
- User requirement: "Усі блоки у Smart order повинні бути згорнуті при першому відкриванні" — every group starts collapsed on first open, not only `docs`/`boilerplate`.
- The spec and the plan did not say this: both had `docs`/`boilerplate` collapsed and the rest open. Updated `specs/007-smart-diff.md` (Design → Smart order; Acceptance) and this plan (AC4, S10 `ROLE_META.defaultOpen`).
- Implementation impact (fix mode, files already in S10/S11): `DiffTab/constants.ts` → `defaultOpen: false` for all roles; `DiffTab/DiffTab.test.tsx` flow 1 → every group `aria-expanded="false"`, then open Core before asserting its files; flow 2 must open the group first. `helpers.test.ts`/`SmartDiffGroup` need no change.
- Changes a recorded behaviour (AC4), so the plan is back to `draft` until the user approves this change.
- 2026-09-26 — the user approved this change ("Так, зміну затверджую"), but asked **not to implement it yet**: the plan and the spec are still being corrected. Status stays `draft` until the user closes the correction round and gives final approval. Then the fix-mode run above goes to the implementer.

### 2026-09-26 — plan change withdrawn: collapse defaults restored
- The user withdrew the "all groups collapsed" requirement: it must work as the spec originally said — only `docs` and `boilerplate` start collapsed, the other groups start open.
- AC4, S10 and `specs/007-smart-diff.md` are restored to the original wording. The code already does this (`DiffTab/constants.ts` ROLE_META), so the pending fix-mode run is cancelled and nothing needs implementing.
- Status stays `draft` while the user continues correcting the plan and the spec.

### 2026-09-26 — plan change: D11 (`package.json` → wiring), D12 (`*.d.ts` → boilerplate)
- Spec `specs/007-smart-diff.md` (rule table + "what is not boilerplate") and this plan (S2 rows, S3 matcher data, Decisions recorded) updated.
- Implementation impact when the round closes (fix mode, files already in S2/S3): `reviewer-core/src/smart-diff/constants.ts` (wiring basenames + `package.json`; boilerplate suffixes + `.d.ts`), `reviewer-core/test/smart-diff-classify.test.ts` (new rows above). The new rows must fail before the constants change (red), like S2.
- Not implemented yet: the user is still correcting the plan and the spec. Status stays `draft`.

### 2026-09-26 — correction round 2: P2/P3 review wishes (items 1–7) + D11/D12 moved into G5
- The user approved adding 7 items: (1) one toggle for comments + findings, (2) `.it` "before the first review", (3) D9 → B stub, (4) sticky group header, (5) "review not run yet" empty state, (6) refresh after a run on any tab, (7) i18n for "Show/Hide comments".
- Added AC12–AC20, D13–D17 (D9 changed to B), step groups G5–G8 (S15–S25), test rows, out-of-scope/risk/context updates; spec `specs/007-smart-diff.md` updated to match.
- The pending D11/D12 fix-mode run is now G5 (S15 red rows → S16 constants). G5, G6 and G7 may run in parallel; G8 after G7.
- Nothing is implemented until the user closes the correction round and approves the plan. Status stays `draft`.

### 2026-09-26 — correction round 3: inline card design + ranges (S26, S27, D18-A, D19-B)
- Design review against the "webhooks.ts" mockup found: plain uppercase line label instead of an outlined pill with icon; the card flush to the file width instead of inset; FindingCard's chevron plus an overlapping ×; no severity word in the card header; a file path instead of `line X-Y`; and multi-line findings marked on `start_line` only.
- The user approved S26 (the design change) and D18-A (mark every added line of the range, card under the last one — a deliberate deviation from the starter's "anchor to `start_line`"). Added AC21, AC22, D18, D19, S26 (diff-viewer), S27 (own card; S22 merged into it), test rows; spec updated.
- Still not implemented; the correction round continues. Status stays `draft`.

### 2026-09-27 — decisions confirmed: D17-A′, D13-C, D16-A, D15-A, vendor/ excluded
- S21 rewritten for D17-A′ (only `PrDetailHeader.tsx`); risk, out-of-scope and handed-off notes adjusted.
- Waiting for the user to close the correction round before `approved`.

### 2026-09-27 — correction rounds closed; plan approved
- The user closed the correction rounds and approved the plan ("так, план затверджено, давай виконувати"). Status: `approved` → `in-progress`.
- Next: G5 ∥ G6 ∥ G7, then G8 (S23–S27; S22 merged into S27).

### 2026-09-27 — verification after G5–G8
- Full server `.it` suite (main session): 15 files / 110 tests passed.
- architecture-reviewer: **PASS**, no findings (handoff: stale `DiffTab.tsx:24` comment about repo/headSha).
- plan-verifier: **incomplete** — 195/215 met, 3 partial, 0 contradicted. Gaps: S27c (stub lacks the severity word; header icon not a 24px tinted square), T18 (range test doesn't assert content under line 73 / no pill on 62), T19 (uppercase word not asserted). Both implementer deviations (DiffTab.tsx edited under S27; `getAllByText("blocker")`) judged acceptable.
- Sent to implementer in fix mode: S27c, T18, T19 + the stale comment.
- Stale wording fixed by the main session: AC6 annotated as superseded by D19-B/D18-A; spec Scope/Acceptance/diagram no longer say "FindingCard".

### 2026-09-27 — re-verification after fix mode (S27c, T18, T19)
- plan-verifier: **complete — needs sign-off**. 198/215 met, 0 partial/missing/contradicted, 17 not-verifiable (manual browser checks, red-first evidence, AC11, R3, R4).
- Its handoff flagged two stub CSS defects (`width: 100%` + margins overflow; `font: inherit` after `fontSize`/`fontWeight`) and an unasserted stub word style — sent to fix mode (S27 files). Goal paragraph and AC14 wording updated by the main session.
- Fix mode closed the stub CSS defects (`width: 100%` removed, `boxSizing: border-box`; `font: inherit` order fixed) and asserts the stub word's uppercase style. Client: typecheck 0; 42 files / 355 tests passed. Awaiting the user's sign-off on the 17 not-verifiable items.

### 2026-09-27 — user sign-off (partial)
- Accepted by the user: red-first evidence (G1 48/48, G5 exactly 5 rows) from the implementer reports; R3 (untracked plan file, changes logged here); R4 (no separate Test Report).
- Still open: manual browser check (AC10, AC20, AC21, AC22) — the main session is starting the app for it; AC11 (PR description) and the commit/PR decision.

### 2026-09-27 — headless browser walk-through (main session)
- Driven with system Chrome via `playwright-core` (scratchpad only) on the user's running stack: PR #9 (korzunss/dev-digest) for groups / collapse / sticky / Original order; PR #81 (RadikKrasnov/sweepskings: lock file, 4 open findings, 3 multi-line) for ●N, file dot, inline card, range pills, × → stub, shared toggle; PR #82 for the "Review not run yet" state. All passed.
- Not exercised: live Run review refresh (AC20-2) — a paid LLM call; the user will check it and the rest of AC10/AC20–AC22 themselves.
- Observations: the Wiring swatch is grey (`--info` is `#6b7280` in this theme, D10) — **the user decided to keep it**; `src/app.module.ts` (NestJS) classifies as core — no rule for it, out of scope; one unexplained console "404" on page load, no failing network response seen.
- Status stays `in-progress` until the user signs off the manual checks.

### 2026-09-27 — plan change: Wiring group colour (D10)
- The user decided to match the mockup: the Wiring swatch becomes orange, `var(--warn)` (`#f59e0b` dark / `#d97706` light), instead of `var(--info)` (grey). Reverses the earlier "keep it grey" note.
- Accepted trade-off: `--warn` is also the WARNING severity colour; in the group header it is only a role swatch, next to the label.
- Implementation impact (fix mode, S10 file): `DiffTab/constants.ts` → `ROLE_META.wiring.color = "var(--warn)"`; no test asserts the colour.
- Changes recorded decision D10 → Status back to `draft` until the user approves.
- 2026-09-27 — the user approved this change ("так, затверджую цю зміну"). Status back to `in-progress`; sent to implementer in fix mode.
- Fix mode done: `ROLE_META.wiring.color = "var(--warn)"`. Client: typecheck 0; 42 files / 355 tests passed. Visual check left to the user.

### 2026-09-27 — closed: Status `done`
- The user signed off the implementation ("затверджую виконання фічи") after the `complete — needs sign-off` verification, accepting the remaining manual items (browser checks AC10/AC20–AC22 done by the user). AC11 (PR description naming the subagents) is fulfilled when the user opens the PR.
- Plan → `done`; spec 007 → `done`.
