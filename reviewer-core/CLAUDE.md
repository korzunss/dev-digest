# reviewer-core/ — `@devdigest/reviewer-core`

The pure review engine: **diff → prompt → LLM → grounded findings**.
Package manager: **npm** (not pnpm).

## Commands

`npm test` (vitest, hermetic) · `npm run typecheck` — **typecheck is the build**;
the package never emits JS.

## Map

```
src/prompt.ts          assemblePrompt() · wrapUntrusted() · INJECTION_GUARD
src/grounding.ts       groundFindings() · groundingSummary()
src/llm/openrouter.ts  the one LLMProvider implementation
src/llm/structured.ts  Zod → JSON Schema · extractJson · parseWithRepair
src/review/run.ts      orchestrates a run (single-pass by default)
src/review/reduce.ts   map-reduce path
src/output/to-review.ts  toReview() CI payload helper
src/index.ts           the public surface — if it isn't exported here, it's internal
```

## Conventions (non-default)

- **Purity is the contract.** No db, no GitHub, no filesystem, no `process.env`.
  The only side effect is a call through the **injected** `LLMProvider`. Anything
  that needs I/O belongs in the server, not here.
- **Grounding is a mandatory gate, not a filter to tune.** A finding that doesn't
  cite a line present in the diff is dropped, and the score is recomputed from the
  survivors — the model's self-reported score is ignored.
- **Prompt-injection defense is one trusted rule, not text parsing.**
  `INJECTION_GUARD` is appended to every system prompt. Do **not** add keyword
  scanning of untrusted content; a denylist only ever catches one phrasing.
- Contracts (`Review`, `Finding`, `Verdict`, …) are imported from
  `@devdigest/shared` — never redefined locally.

## Gotchas

- The server consumes this package's **TypeScript source** through a tsconfig path
  alias (tsx in dev, vitest in tests). A change here hits the server with no build
  step — and `server-unit` CI is path-filtered to run on `reviewer-core/**`.
- `assemblePrompt` accepts optional slots (`skills`, `memory`, `specs`,
  `callers`) that the starter server doesn't pass. Omitted slots simply leave
  their section out — an empty section is not a bug.

## Read on demand

- Pipeline diagram and the exported API → `README.md`
- Deep topics (prompt design, structured output, scoring) → `docs/README.md`
- Feature specs — read the spec before implementing the feature → `specs/README.md`
- Solved bugs and surprises → `INSIGHTS.md`
