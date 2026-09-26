# client — current gotchas

Last reconciled with ../INSIGHTS.md: 2026-09-26

This is a curated index of rules still in force. Full write-ups live in
[`client/INSIGHTS.md`](../INSIGHTS.md) (append-only log). A rule that stops
holding is edited or removed here. Items are added or updated by the
`engineering-insights` skill.

## Tests

- **There is no `@testing-library/user-event` in this package — write interaction tests with synchronous `fireEvent`, not `userEvent.setup()`.** — spot it: a new test's `user-event` import fails to resolve, in a repo where every other RTL idiom works. — [INSIGHTS: 2026-09-18 — there is no `@testing-library/user-event` here; use `fireEvent`](../INSIGHTS.md#2026-09-18--there-is-no-testing-libraryuser-event-here-use-fireevent)
- **When overriding one export of a shared hooks barrel with `vi.mock`, spread the real module first via `importActual` — the bare factory form replaces every export.** — spot it: a test fails inside a component or hook it never named, deep in the render tree (e.g. a mocked `lib/hooks/reviews.ts` crashing `FindingsPanel`). — [INSIGHTS: 2026-09-23 — `vi.mock` of a hooks barrel breaks children, and the error names the child](../INSIGHTS.md#2026-09-23--vimock-of-a-hooks-barrel-breaks-children-and-the-error-names-the-child)
- **When `getByText` reports multiple matches on i18n copy, check whether the two UI states mean the same thing before widening the query.** — spot it: RTL's `Found multiple elements with the text: …` on a string reused across more than one empty/error state — usually a copy bug, not a query bug. — [INSIGHTS: 2026-09-22 — `getByText` finding "multiple elements" is usually a copy bug, not a query bug](../INSIGHTS.md#2026-09-22--getbytext-finding-multiple-elements-is-usually-a-copy-bug-not-a-query-bug)

## UI

- **Adding a nav item to `src/vendor/ui/nav.ts` is the one sanctioned hand-edit of vendored UI — record it in the spec that asks for it and comment the line, since a vendor refresh silently drops it.** — spot it: a new route only reachable by typing its URL, with no NAV/SETTINGS_ITEM extension point anywhere downstream. — [INSIGHTS: 2026-09-22 — `vendor/ui/nav.ts` is the one vendored file we edit, and the edit is disposable](../INSIGHTS.md#2026-09-22--vendoruinavts-is-the-one-vendored-file-we-edit-and-the-edit-is-disposable)
- **An overlay that must escape a PR-list row (e.g. a hover card) needs `createPortal` into `document.body` with `position: fixed`, positioned from `getBoundingClientRect()` and flipped above the trigger near the viewport bottom.** — spot it: a popover silently cut off at a row's edge, with no error and nothing in the DOM to explain why. — [INSIGHTS: 2026-09-18 — a popover inside the PR list must portal; the table clips it](../INSIGHTS.md#2026-09-18--a-popover-inside-the-pr-list-must-portal-the-table-clips-it)
- **When only one side of a border differs, write all four sides longhand (`borderTopColor`/`borderRightColor`/`borderBottomColor`/`borderLeftColor`, same for width) — pairing a shorthand like `borderColor` with one longhand side still mixes shorthand and longhand.** — spot it: React's `Updating a style property during rerender` warning firing only after an interaction changes the value on an already-mounted node, never on first paint. — [INSIGHTS: 2026-09-18 — "Updating a style property during rerender" survives the obvious fix](../INSIGHTS.md#2026-09-18--updating-a-style-property-during-rerender-survives-the-obvious-fix)

## Tooling

- **Wrap every page that calls `useSearchParams()` in a `<Suspense>` boundary regardless of whether `pnpm build` currently complains — it only fails on routes it actually prerenders.** — spot it: check the `○` (static) vs `ƒ` (dynamic) column of the `pnpm build` route table; a dynamic route with no boundary builds clean today and breaks the day it becomes static. — [INSIGHTS: 2026-09-22 — the `useSearchParams`/`Suspense` rule only bites on STATIC routes](../INSIGHTS.md#2026-09-22--the-usesearchparamssuspense-rule-only-bites-on-static-routes)
