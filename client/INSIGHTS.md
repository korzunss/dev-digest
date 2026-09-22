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

_Nothing yet._

## Codebase Patterns

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

_Nothing yet._
