---
status: done
packages: reviewer-core, server, client
---

# 001 — Run cost: persist it, then show it in three places

## Problem

Every review run already has a price. `reviewPullRequest()` returns `costUsd` —
the REAL `usage.cost` figure OpenRouter reports, or a price-book estimate for the
providers that don't report one (`reviewer-core/src/review/run.ts:104`,
`reviewer-core/src/llm/openrouter.ts:107`). The server then throws it away:
`completeAgentRun()` takes tokens but not cost, and `agent_runs` has no column
for it (`server/src/db/schema/runs.ts:8`).

So a user running a dozen agents across a repo has no idea what any of it costs —
not per run, not per PR, not in total. The number exists; it is dropped one
function call before persistence.

Two contracts already declare cost fields that nothing populates
(`AgentColumn.cost_usd`, `AgentStats.total_cost_usd` in
`contracts/observability.ts`). This spec does not implement those screens, but it
puts the column in place that would feed them.

## Scope

- Persist per-run cost on `agent_runs`: `cost_usd` + `cost_source` (`api` |
  `estimate`).
- Thread a `costSource` through the LLM contract so "real price" and "our guess"
  are distinguishable at the point where the difference is actually known.
- Surface it on three screens:
  1. **Pull Requests list** — a `COST` column, the SUM of every run of that PR.
  2. **PR detail → Agent runs timeline** — `9,119 tok · $0.0013` under the run's
     timestamp.
  3. **Run trace drawer → Stats** — a `COST` tile beside DURATION / TOKENS /
     FINDINGS.
- One-shot backfill of historical runs (estimated from stored token counts),
  marked `estimate` so it is never confused with a reported price.
- An estimated figure renders with a `~` prefix (`~$0.014`); a reported one
  renders bare (`$0.014`).

**Not in scope.** Multi-Agent Review columns and the Agent Performance dashboard
(their contracts exist; wiring them is a separate spec). Budgets, caps, alerts,
or any spend limit. Cost of non-review LLM work (embeddings, repo-intel, brief
generation) — this is *review run* cost only. Sorting or filtering the PR list by
cost. Currency other than USD. Attributing cost to a failed run.

## Design

### Where the number comes from

Unchanged, and deliberately so: **zero additional model calls, zero additional
network calls on any read path.** The value is already computed during the run.

```
OpenRouter usage.cost  ──┐
                         ├─> StructuredResult.costUsd + costSource
PriceBook / estimateCost ┘            │
                                      v
                     ReviewOutcome.costUsd + costSource   (reviewer-core)
                                      v
                     agent_runs.cost_usd + cost_source    (server, at completion)
                                      v
              RunSummary · RunTrace.stats · PrMeta        (contracts)
                                      v
                 timeline row · Stats tile · COST column  (client)
```

`PriceBook` (`server/src/platform/price-book.ts`) stays exactly as it is: live
OpenRouter prices with a lazy background refresh, static table as fallback. It is
injected into the provider today and is the only pricing authority.

### Contract changes (`shared` first, then consumers)

Per the repo rule, all of these land in `server/src/vendor/shared` and are then
mirrored verbatim into `client/src/vendor/shared`.

| Contract | Change |
|---|---|
| `adapters.ts` → `StructuredResult`, `CompletionResult` | `+ costSource?: 'api' \| 'estimate'` |
| `trace.ts` → `RunSummary` | `+ cost_usd: number \| null`, `+ cost_source: 'api' \| 'estimate' \| null` |
| `trace.ts` → `RunStats` | `+ cost_usd: nullish`, `+ cost_source: nullish` |
| `platform.ts` → `PrMeta` | `+ cost_usd: nullish`, `+ cost_source: nullish` (list endpoint only, like `score`) |

`RunStats` fields are **nullish, not nullable-required**: `run_traces.trace` is a
jsonb document and every trace written before this change lacks them. A required
field would fail to parse historical traces.

### `costSource` — why it exists and where it is decided

The only place that knows whether a price was reported or guessed is the provider
that produced it:

- `OpenRouterProvider` — `usage.cost` present → `'api'`; fell through to the
  injected `estimateCost` → `'estimate'`; neither → `costUsd: null`, source null.
- `OpenAIProvider` / `AnthropicProvider` — always `'estimate'` (they price from
  the static table; their APIs report no cost).

`reviewPullRequest()` aggregates across chunks (map-reduce makes one call per
file) with **worst-wins**: if any chunk was estimated, the run's source is
`estimate`. A run is only `api` when every call in it reported a real price. Same
rule for the per-PR sum on the list.

This keeps `reviewer-core` pure — it is one more field on an already-injected
result, no new I/O.

### Persistence

```ts
// server/src/db/schema/runs.ts — agentRuns
costUsd: doublePrecision('cost_usd'),
costSource: text('cost_source', { enum: ['api', 'estimate'] }),
```

`doublePrecision` matches the existing precedent for money in this schema
(`ci.ts:23`, `eval.ts:34`). Both nullable — null means "we do not know", which is
a real and common state (unknown model slug, failed run, legacy row).

Migration is **generated**, never hand-written: `pnpm db:generate` →
`0010_*.sql`, applied with `pnpm db:migrate`. The server does not migrate on boot
(`server/INSIGHTS.md`), so the migrate step is part of the rollout, not of `dev`.

`completeAgentRun()` gains `costUsd?: number | null` and
`costSource?: 'api' | 'estimate' | null`. The three call sites in
`run-executor.ts` pass them; the two failure paths (lines 78, 298) pass nothing →
null.

**A failed or cancelled run stores no cost.** Tokens were probably spent, but the
engine throws before returning an outcome, so we have no number — and inventing
one is worse than the em dash. Recorded here so the next reader does not treat it
as an oversight.

### Backfill

`server/src/db/backfill-run-cost.ts`, wired as `pnpm db:backfill-cost`.

For every `agent_runs` row where `cost_usd IS NULL AND model IS NOT NULL AND
tokens_in IS NOT NULL`: price it from the stored token counts and write it with
`cost_source = 'estimate'`. Unknown model slug → the estimator returns null →
the row is left untouched and keeps rendering `—`. Idempotent: it only ever
reads rows whose cost is null, so re-running it is a no-op. Prints how many rows
it priced and how many it left unpriced.

The estimator is **injected** (`backfillRunCost(db, estimate)`) so tests can
drive it with a stub. The CLI passes the static `estimateCost` table rather than
the live `PriceBook`: it needs no API key to run, and it is what runs of that
era were priced against anyway. Either way the result is marked `estimate`, so
nothing the backfill writes can pass for a reported price.

### The per-PR sum (Pull Requests list)

`GET /repos/:id/pulls` already does one `IN` query over `reviews` plus JS grouping
to attach the latest score. Cost follows exactly that shape — one `IN` query over
`agent_runs` for the page's PR ids, grouped in JS by a pure helper in
`modules/pulls/status.ts` (the file that already exists for "PR-list rollup
helpers"):

```ts
export function rollupCost(rows: { costUsd: number | null; costSource: string | null }[]):
  { cost_usd: number | null; cost_source: 'api' | 'estimate' | null }
```

Rules: rows with a null cost are ignored; **no row priced → `null`, not `0`**
(that is the whole point of the em dash); any contributing row `estimate` → the
sum is `estimate`.

Deliberately NOT an SQL `SUM()`: the worst-wins source rule needs the same pass,
the helper is pure and unit-testable without Docker, and the page's PR count is
small — the same reasoning that put the score rollup in JS.

### Client

**One formatter, three call sites.** `client/src/lib/format-cost.ts`:

```ts
formatCostUsd(value: number | null | undefined, source?: 'api' | 'estimate' | null): string
```

| Input | Output | Why |
|---|---|---|
| `null` / `undefined` | `—` | unknown ≠ free |
| `0` | `$0.00` | a genuinely free model (`z-ai/glm-4.7-flash` is priced 0/0) |
| `< 0.01` | `$0.0013` | 4 dp — a single cheap run is otherwise all zeros |
| `< 1` | `$0.014` | 3 dp — the PR-list aggregate range |
| `>= 1` | `$1.23` | 2 dp |
| `source === 'estimate'` | `~` prefix | `~$0.014` |

Below $1 the zeros the widening added are trimmed back off, with two decimals
as the floor: `0.06 → "$0.06"` (not `"$0.060"`), `0.5 → "$0.50"`, while
`0.0013` keeps all four. Money never shows fewer than two decimals.

`RunCostBadge` (`client/src/components/run-cost-badge/`) — shared chrome, used by
two routes, so it lives in `src/components/` rather than beside either route. Two
variants:

- `variant="cell"` — the PR-list column: just the formatted cost, muted `—` when
  null.
- `variant="inline"` — the timeline: `{tokens} tok · {cost}`, where tokens is
  `tokens_in + tokens_out` with a thousands separator. Omits the token half when
  tokens are null.

Both carry a `title` tooltip explaining an estimate ("Estimated from token counts
× model price — the provider did not report a cost").

The trace drawer does not use the badge — it needs the existing `Stat` tile
shape, so it calls `formatCostUsd` directly, exactly like it already calls
`formatSeconds` / `formatTokens`.

Copy comes from `next-intl`, no hardcoded strings: `prReview.list.columns.cost`,
`prReview.cost.estimateTooltip`, `runs.trace.stat.cost`.

**Layout.** `GRID` in the PR list's `constants.ts` goes from
`"1fr 132px 92px 60px 118px 78px"` to `"1fr 132px 92px 60px 118px 78px 78px"`
with `"cost"` inserted into `COLUMN_KEYS` before `"updated"` (matching the
design). Header and rows share the same `GRID` constant, so the two stay in
lock-step by construction.

## Acceptance

1. A completed review run against OpenRouter writes a non-null `cost_usd` with
   `cost_source = 'api'` — the value is OpenRouter's reported `usage.cost`, not a
   recomputation.
2. The same run against OpenAI or Anthropic writes `cost_source = 'estimate'`,
   and every UI surface shows it with a `~` prefix.
3. A map-reduce run over N files stores the SUM of all N calls, and reads
   `estimate` if any single call was estimated.
4. A failed or cancelled run stores `cost_usd = NULL` and renders `—` on all
   three screens — never `$0.00`.
5. A run whose model slug is unknown to both the live price book and the static
   table stores `NULL` and renders `—`.
6. The PR list `COST` column equals the sum of that PR's run costs; a PR with no
   priced run shows `—`. The number is reachable by adding up the rows of that
   PR's timeline.
7. The timeline row of a completed run reads `9,119 tok · $0.0013`, aligned under
   the run's time.
8. The trace drawer Stats section shows a `COST` tile between `TOKENS` and
   `FINDINGS`.
9. A trace document written before this change still opens: the Stats section
   renders with `COST —` rather than failing to parse.
10. `pnpm db:backfill-cost` prices every legacy run that has tokens and a known
    model, marks them `estimate`, and is a no-op on a second run.
11. Rendering cost anywhere triggers zero LLM calls and zero extra HTTP requests:
    the PR list still issues one query per rollup, and the drawer still reads one
    trace document.
12. `pnpm typecheck` passes in `server/`, `client/` and `reviewer-core/`, and the
    cost fields are identical in both vendored `shared` copies. (Only the cost
    fields: the two copies had already drifted before this spec — the client one
    lacks `openrouter` in several enums and the whole `AgentManifest` schema —
    and closing that gap is not this feature's job.)
