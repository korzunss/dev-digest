# `@devdigest/web` — the studio (Next.js 15)

The DevDigest UI: import repos, browse pull requests, run and read AI reviews,
and author agents. App Router + React Server/Client components, data via
**TanStack Query** hooks over the Fastify API. (This is the starter surface;
course lessons add the Skills, Memory, Eval, Blast/Brief, multi-agent, CI, and
dashboard screens.)

- **Stack:** Next.js 15 (App Router), React 19, TanStack Query, `next-intl`
  (messages in `messages/<locale>/*.json`), `recharts`, `mermaid`,
  `react-markdown`. UI primitives are vendored under `src/vendor/ui`
  (`@devdigest/ui`) and shared Zod contracts under `src/vendor/shared`
  (`@devdigest/shared`).
- **API base:** `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`), used by
  `src/lib/api.ts`. Every data hook lives in `src/lib/hooks/*`.
- **Run:** `pnpm dev` (`:3000`). **Test:** `pnpm test` (vitest + jsdom, fetch
  mocked — no API needed). **Typecheck:** `pnpm typecheck`.

## UI route map

Routes (`src/app/**/page.tsx`) cover the repo/PR flow (`/`, `/onboarding`,
`/repos/:repoId/pulls`, `/pulls/:number`, `/repos/:repoId/conventions`),
agent and skill management (`/agents`, `/agents/:id`, `/skills`, `/skills/:id`),
and `/settings/:section`. Each talks to the Fastify API only through
`src/lib/hooks/*` → `src/lib/api.ts`. Cross-cutting chrome lives in
`src/components/app-shell` (nav, breadcrumbs, `g`-then-key shortcuts). Pages
are thin; feature logic sits in colocated `_components/<Name>/` folders, each
with its own `*.test.tsx`.

For the full route-by-route RSC/client breakdown, the data-hook and SSE
details, i18n and styling conventions, and how UI tests are written here, see
[`docs/ui-architecture.md`](docs/ui-architecture.md).

## Testing

Component/interaction tests (`*.test.tsx`) run under vitest + jsdom with `fetch`
mocked, so they need neither the API nor a browser. The real browser journeys
(client + API + seeded DB) are covered by the deterministic agent-browser suite
in [`../e2e`](../e2e/README.md) and the `e2e-web.yml` workflow. See
[`../TESTING.md`](../TESTING.md).
