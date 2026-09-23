# client/ — `@devdigest/web`

Next.js 15 App Router studio for DevDigest. Package manager: **pnpm**.

## Commands

`pnpm dev` (:3000) · `pnpm build` · `pnpm test` (vitest + jsdom) · `pnpm typecheck`

## Map

```
src/app/**/page.tsx          routes; pages stay thin
src/app/**/_components/      colocated feature components, each with *.test.tsx
src/components/app-shell/    nav, breadcrumbs, `g`-then-key shortcuts
src/lib/api.ts               the single fetch layer
src/lib/hooks/*              one TanStack Query hook per endpoint
src/vendor/ui                @devdigest/ui primitives (vendored)
src/vendor/shared            @devdigest/shared Zod contracts (vendored)
messages/<locale>/*.json     next-intl, one file per feature namespace
```

## Conventions (non-default)

- **No `fetch` in components.** Data goes component → `src/lib/hooks/*` →
  `src/lib/api.ts`. A hook per endpoint is the unit of reuse.
- **Feature logic is colocated**, not centralized: `_components/<Name>/` next to
  the route that uses it, with its test beside it. Shared-across-routes chrome is
  the exception and lives in `src/components/`.
- **User-facing strings come from `next-intl`**, keyed by feature namespace —
  `messages/en/<namespace>.json`. Don't hardcode copy in JSX.
- **Import aliases:** `@/*` → `src/*`, plus `@devdigest/ui` and
  `@devdigest/shared`. Prefer these over deep relative paths.
- **Two folder cases, on purpose.** Shared chrome in `src/components/` uses
  `kebab-case/` directories (`app-shell/`, `run-cost-badge/`); colocated feature
  components under `_components/` use `PascalCase/` (`AgentCard/`, `FilterBar/`).
  Both are followed everywhere today — picking the wrong one breaks nothing at
  build time, which is exactly why it drifts. Inside either: `<Name>.tsx` +
  `<Name>.test.tsx` + an `index.ts` barrel, with `styles.ts` / `helpers.ts` /
  `constants.ts` lowercase beside them.

## Gotchas

- `src/vendor/**` is vendored from elsewhere — a contract fix belongs in
  `server/src/vendor/shared` first, then gets mirrored here.
- Tests mock `fetch`; they need neither the API nor a browser. Real browser
  journeys live in `e2e/`, not here.
- `messages/en/` already contains namespaces for features the starter doesn't
  ship yet (skills, memory, eval, blast…). Unused namespaces are expected.

## Read on demand

- UI route map and the API surface each route leans on → `README.md`
- Deep topics (state, i18n, design system) → `docs/README.md`
- Feature specs — read the spec before implementing the feature → `specs/README.md`
- Solved bugs and surprises → `INSIGHTS.md`
