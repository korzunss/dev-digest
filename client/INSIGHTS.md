# Insights — `@devdigest/web`

Append-only. Things that cost someone time in the web app. Repo-wide findings go
in [`../INSIGHTS.md`](../INSIGHTS.md), which carries the entry format, the section
guide and the promotion rule (a standing rule becomes one line under `Gotchas` in
`client/AGENTS.md`). The `engineering-insights` skill writes here.

```md
### YYYY-MM-DD — short title
**Symptom:** what you observed.
**Cause:** why it happened.
**Rule:** what to do from now on.
**Evidence:** `path/to/file.ts:42` · command · error string
```

---

## What Works

_Nothing yet._

## What Doesn't Work

### 2026-10-05 — a list editor backed by a replace-all PUT, rendered before its data loads, wipes the stored list on the first click
**Symptom:** plan 24: the agent and skill Context tabs rendered `ContextDocPicker` while `useAgentContext` / `useSkillContext` was still loading, so `attached` was `[]`; the first checkbox toggle sent `PUT …/context {paths: [that one path]}` and silently replaced every stored link.
**Cause:** `PUT /agents/:id/context` and `/skills/:id/context` replace the whole ordered list, and the picker computes the next list from what it was given — an unloaded query looks exactly like "nothing attached".
**Rule:** any editor that sends the whole list back must not render its controls until the stored list has loaded: early-return a `Skeleton` on `isLoading` and an `ErrorState` with `onRetry` on `isError`.
**Evidence:** `client/src/app/agents/[id]/_components/AgentEditor/_components/ContextTab/ContextTab.tsx` and `client/src/app/skills/[id]/_components/SkillEditor/_components/ContextTab/ContextTab.tsx` (loading/error guards) · their `ContextTab.test.tsx` "no checkboxes while loading or failed"

## Codebase Patterns

### 2026-09-22 — `vendor/ui/nav.ts` is the one vendored file we edit, and the edit is disposable

**Symptom:** spec 004 asks for a sidebar entry under SKILLS LAB, and the only
place that can carry one is `client/src/vendor/ui/nav.ts` — a file `CLAUDE.md`
lists under "Do not touch". There is no override file, no app-level `NAV`
extension point, and no consumer that merges a local array into the vendored
one: `useGlobalShortcuts` and the shell both read `NAV` straight from
`@devdigest/ui`. Left alone, the Conventions screen would only be reachable by
typing its URL.
**Cause:** the vendored UI kit treats the nav as *data about the host app*,
which the host app is the only one who knows — so the data lives upstream while
its content is downstream's business. That is a packaging mistake in the kit,
not a rule we can satisfy by finding the right seam here.
**Rule:** adding a nav item (and only a nav item) to `NAV`/`SETTINGS_ITEM` is a
signed-off exception, recorded in the spec that asks for it and commented at the
line. Nothing else under `src/vendor/**` follows from it — a contract change
still starts in `server/src/vendor/shared`. Treat the line as **disposable**:
the next vendor refresh overwrites `nav.ts` wholesale and silently takes the
entry with it, and the symptom is a route that still builds, still renders, and
has simply vanished from the sidebar. After any kit refresh, `grep -c 'key: "'
client/src/vendor/ui/nav.ts` and re-add what is missing; the route table from
`pnpm build` will not tell you, because the page is fine.
**Evidence:** `client/src/vendor/ui/nav.ts` → the `conventions` item and its
comment · `src/components/app-shell/hooks/useGlobalShortcuts.ts:45` reads `NAV`
directly · `specs/004-conventions-extractor.md` → "Risks and known traps" #7

### 2026-09-18 — a popover inside the PR list must portal; the table clips it

**Symptom:** a hover card rendered as an absolutely-positioned child of a PR row
is cut off at the row's bottom edge — the part that overflows simply is not
painted, with no error and nothing in the DOM to suggest why.
**Cause:** the list's `tableCard` sets `overflow: "hidden"` (for its rounded
corners), so every descendant is clipped to the table's box. Rows near the
viewport bottom have a second problem: even unclipped, the card would open below
the fold.
**Rule:** render any overlay that escapes a row through `createPortal` into
`document.body` with `position: fixed`, positioned from the trigger's
`getBoundingClientRect()`, and flip it above the trigger when
`rect.bottom + cardHeight > window.innerHeight`. Give it `pointerEvents: "none"`
if it is hover-only — it sits on the cursor's path to the row and would otherwise
swallow clicks meant for the row underneath.
**Evidence:** `src/app/repos/[repoId]/pulls/styles.ts` → `tableCard.overflow` ·
`src/components/findings-preview/FindingsPreview.tsx`

## Tool & Library Notes

### 2026-10-05 — a vitest path filter containing `[repoId]` matches no files, even escaped
**Symptom:** plan 24's S19 Done-when `pnpm exec vitest run 'src/app/repos/\[repoId\]/context'` printed "No test files found, exiting with code 1"; the same tests ran under `pnpm exec vitest run context/`.
**Cause:** vitest 2.1.9 treats the filter as a pattern; the bracketed Next.js route segment never matches the literal path, with or without backslashes.
**Rule:** filter client tests on a bracket-free substring of the path (`context/`, `RunTraceDrawer`), and write plan Done-when commands the same way.
**Evidence:** plan 24 Verification log (D32) · `client/src/app/repos/[repoId]/context/`

### 2026-09-27 — `SeverityBadge compact` renders the icon only, never the severity word
**Symptom:** plan 02 asked the inline finding card and its collapsed stub for
"severity badge + word". The implementation used `<SeverityBadge compact />`,
tests passed, and the plan-verifier then found the word missing on screen
(gap S27c) — a whole fix-mode round.
**Cause:** in the vendored primitive `compact` does not mean "smaller": it
drops the label (`{compact ? null : s.label}`) and leaves only the icon. The
prop name does not say so, and FindingCard (the usual reference) uses the
compact form because its title row carries the meaning.
**Rule:** when a design needs the severity word, render it yourself from
`SEV[sev]` / the i18n label next to the icon, or use `SeverityBadge` without
`compact`. Write the word into a test assertion so the gap cannot pass silently.
**Evidence:** `src/vendor/ui/primitives/Badge.tsx:80` · plan
`docs/plans/02-smart-diff.md` → Verification log, gap S27c ·
`src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/InlineFinding/InlineFinding.tsx`

### 2026-09-27 — `pnpm test -- <pattern>` does not filter; it runs the whole suite
**Symptom:** a targeted run such as `pnpm test -- DiffTab/helpers` in `client/`
printed `Test Files 42 passed (42)` — every file, not the one asked for. It
looks like a filter that matched broadly, so a green run gets read as "the
target passed" while the target may not have been the point at all.
**Cause:** `"test": "vitest run"` plus pnpm's passthrough gives
`vitest run -- <pattern>`; vitest treats everything after `--` as not a file
filter and runs all files.
**Rule:** for a targeted client run use `pnpm exec vitest run <pattern>` (no
`--`). Write plan Done-whens that way; `pnpm test` stays the whole-suite check.
**Evidence:** `client/package.json:10` · `pnpm test -- run-settled` → `$ vitest
run -- run-settled` … `Test Files 42 passed (42)` vs `pnpm exec vitest run
run-settled` → `Test Files 1 passed (1)`

### 2026-09-22 — the `useSearchParams`/`Suspense` rule only bites on STATIC routes

**Symptom:** the codebase looks inconsistent about a build-breaking rule.
`skills/page.tsx` wrapped its view in `<Suspense>` with a comment saying every
search-param consumer does, while `agents/[id]/page.tsx` calls
`useSearchParams()` at the top of a `"use client"` page with no boundary at all
— and `pnpm build` is green on both.
**Cause:** Next only fails the build when it tries to PRERENDER the page.
`/agents/[id]` and `/skills/[id]` are dynamic (`ƒ` in the build table) because a
`[param]` route with no `generateStaticParams` is never prerendered, so the
missing boundary is never exercised. `/skills` and `/agents` are static (`○`) and
are, so there the same code aborts the build.
**Rule:** read the `○`/`ƒ` column of the `pnpm build` route table before
concluding a page is safe. Add the boundary on every page that reads
`useSearchParams` regardless — a route flips from `ƒ` to `○` the day someone
adds `generateStaticParams` or drops the dynamic segment, and the failure then
lands on whoever made that unrelated change. Inside a `"use client"` page the
boundary is a two-component split in the same file (default export renders
`<Suspense><Route/></Suspense>`); there is no need for a separate file.
**Evidence:** `pnpm build` → `○ /skills` vs `ƒ /skills/[id]` ·
`src/app/skills/[id]/page.tsx` · `src/app/agents/[id]/page.tsx` (no boundary,
builds clean)

### 2026-09-18 — there is no `@testing-library/user-event` here; use `fireEvent`

**Symptom:** a new component test written the usual way — `const user =
userEvent.setup(); await user.click(…)` — fails to resolve the import, in a repo
where every other RTL idiom works.
**Cause:** `@testing-library/user-event` is not a dependency of `client/`. Only
`@testing-library/react` and `jsdom` are installed, and every existing test
drives interaction with `fireEvent.click`.
**Rule:** write interaction tests with `fireEvent` and keep them synchronous —
no `await user.…`, no `userEvent.setup()`. Check `grep user-event
client/package.json` before reaching for it out of habit.
**Evidence:** `client/package.json` (no `user-event` entry) ·
`src/app/repos/[repoId]/pulls/[number]/_components/RunReviewDropdown/RunReviewDropdown.test.tsx`

## Recurring Errors & Fixes

### 2026-09-27 — TS2742 from a `styles.ts` that spreads a separately typed base object
**Symptom:** `pnpm typecheck` failed on a new colocated `styles.ts` with
`TS2742: The inferred type of 's' cannot be named without a reference to
'.pnpm/csstype@3.2.3/…'. This is likely not portable.` The file looked like
every other `styles.ts` in the app.
**Cause:** the client compiles with `declaration: true`, so the inferred type of
the exported `s` object must be nameable. Spreading a separately declared
`const base: CSSProperties = {…}` into an entry that itself uses
`satisfies CSSProperties` makes TypeScript reach into pnpm's nested `csstype`
path for the emitted type.
**Rule:** in `styles.ts` give every entry its own full literal with
`satisfies CSSProperties` — no shared base object spread into entries. A
dynamic value is a function entry (`(color: string): CSSProperties => ({…})`),
not a spread at the call site.
**Evidence:** `src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/_components/DiffOrderToggle/styles.ts`
(error reproduced before the fix, plan 02 G3 report) · the pattern it follows:
`ConventionList/styles.ts`

### 2026-09-23 — `vi.mock` of a hooks barrel breaks children, and the error names the child

**Symptom:** a test for `ReviewRunAccordion` mocked one hook —
`vi.mock('.../lib/hooks/reviews', () => ({ useDeleteReview: … }))` — and four
of six cases passed. The two that expanded the accordion failed with a stack
pointing at `FindingsPanel.tsx:31` and `useFindingAction()`, a component and a
hook the test never mentions. It reads like a bug in `FindingsPanel`.
**Cause:** the factory form of `vi.mock` REPLACES the whole module. Everything
the barrel exported and the factory did not list becomes undefined, so any
child rendered in the same subtree that imports a sibling hook from that barrel
gets `undefined()` at render. `lib/hooks/reviews` is exactly such a barrel —
`useDeleteReview`, `useFindingAction`, `usePrReviews` and more all live there —
and the failure only appears in the cases that render deep enough to reach one.
**Rule:** when overriding ONE export of a shared barrel, spread the real module
first: `vi.mock(path, async (importActual) => ({ ...(await
importActual<Record<string, unknown>>()), useX: … }))`. Reach for the bare
factory form only for a module with a single export. And when a component test
fails inside a component it never named, suspect the mock before the component.
**Evidence:** `src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.test.tsx`
→ the `importActual` spread · `FindingsPanel.tsx:31` → `useFindingAction()` ·
`src/lib/hooks/reviews.ts` (one barrel, many hooks)

### 2026-09-22 — `getByText` finding "multiple elements" is usually a copy bug, not a query bug

**Symptom:** a new component test failed with RTL's
`Found multiple elements with the text: No context attached`, pointing at a
`screen.getByText(messages.context.empty.title)` that looked perfectly
reasonable. The obvious fixes — `getAllByText(...)[0]`, or narrowing with a
`within()` — both make it pass.
**Cause:** the component rendered that ONE string for three different states:
no repository selected, the repository carries no context documents, and
documents exist but none are attached. Only the third one is "No context
attached"; the other two were telling the user the wrong thing about what to do
next. The duplicate match was the test reporting a product defect, and widening
the query would have silenced it.
**Rule:** when `getByText` reports multiple matches on i18n copy, check whether
the two places mean the same thing before touching the query. Because tests here
assert against `messages/en/*.json` values rather than test ids, a string reused
across states is *structurally* undetectable except like this — it is the only
signal you get. Reach for `getAllByText`/`within` only once you have confirmed
the copy is genuinely the same statement in both places.
**Evidence:** `src/app/skills/[id]/_components/SkillEditor/_components/ContextTab/ContextTab.tsx`
→ `context.noRepo` / `context.noDocs` / `context.empty` are now three keys ·
`ContextTab.test.tsx` → "distinguishes a repo with no documents from nothing
being attached"

### 2026-09-18 — "Updating a style property during rerender" survives the obvious fix

**Symptom:** React logs `Updating a style property during rerender
(borderColor) when a conflicting property is set (borderLeftColor)` from
`FindingCard`, in a style object that had already been converted to "longhand"
to silence this exact warning — the file even carries a comment saying so.
**Cause:** two things compound. `borderColor` and `borderWidth` are themselves
SHORTHANDS for the four sides, so pairing either with `borderLeftColor` is still
a shorthand/longhand mix; dropping `border`/`borderLeft` only got halfway. And
the warning only fires when the shorthand's VALUE CHANGES on an already-mounted
node — here `focused ? sevColor : var(--border)` — so a style can sit wrong for
months and surface the day a new feature makes focus move between mounted cards.
**Rule:** when one side of a border differs, write all four sides longhand
(`borderTopColor`/`borderRightColor`/`borderBottomColor`/`borderLeftColor`, same
for width). A static shorthand like `borderStyle: "solid"` is fine — it never
updates. Guard it with a test that spies on `console.error` and asserts nothing
matches `/shorthand/i` **after** an interaction that moves focus; a render-only
assertion passes either way, because the first paint never warns.
**Evidence:** `FindingCard/styles.ts:5` ·
`FindingsPanel.test.tsx` → "does not mix shorthand and non-shorthand border styles"

## Session Notes

_Nothing yet._

## Open Questions

### 2026-10-02 — the live review log stops at the first `[error]` line while the run continues
**Symptom:** the PR #13 live log froze at `[error] … no answer … within 10 min — aborted` (11:18, 97 lines). The run went on server-side: `GET /runs/:id/events` had 156 events by 11:34, and the plan 08 retry finished that file.
**Cause (likely, not yet reproduced in a browser):** the server sends run-error events as SSE `event: error`. On an `EventSource`, a named `error` event also fires `onerror`, and `useRunEvents` treats `onerror` as a dead connection: `es.onerror = () => { es.close(); … }` (`src/lib/hooks/reviews.ts:223-226`). The listener added for `"error"` at `:219` then never sees later events.
**To pick up:** tell a transport error from a server `error` event (e.g. close only when `es.readyState === EventSource.CLOSED`, or have the server use another event name such as `run-error`, a cross-package change). Then add a test that an `error`-kind event leaves the stream open.
**Evidence:** run `6098841a-12ac-4d74-9374-11db2e18f7c1`; screenshot of the frozen log vs `curl -N /runs/<id>/events`.
