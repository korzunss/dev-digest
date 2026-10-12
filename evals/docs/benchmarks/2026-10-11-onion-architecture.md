# Benchmark: skills/onion-architecture (with vs without the skill)

- Date: 2026-10-11 · git sha `224070e-dirty` (working tree with uncommitted eval changes)
- Task model `claude-haiku-4-5` · judge `claude-sonnet-5` · n = 5 runs per configuration (8 cases, 40 records each)
- Command: `cd evals && pnpm eval:benchmark skills/onion-architecture -n 5`
- Raw report (gitignored): `evals/results/benchmarks/2026-10-11T19-03-26-504Z/benchmark.{md,json}`

**Note on the run.** The process was killed at the 2 h background-command limit during baseline run 5/5 (4 of 8 records written). The missing baseline run was re-run with the same per-run invocation the benchmark uses (`EVAL_CONFIG=baseline EVAL_QUIET=1 vitest run --reporter=dot skills/onion-architecture`), and the report was rebuilt by a scratch copy of `src/records/benchmark.ts` that differs only in the record source (partial run dropped). Repo code is unchanged. Treat the numbers as one sample, not a re-measured benchmark.

## Summary

| metric | candidate | baseline |
|---|---|---|
| pass_rate | 75% | 35% |
| tokens_out | 9050 ± 3945 [2502-19270] (n=40) | 7271 ± 3693 [1508-14241] (n=40) |
| duration_ms | 83142 ± 36471 [23639-183667] (n=40) | 66321 ± 30883 [15772-121898] (n=40) |
| num_turns | 1 ± 0 | 1 ± 0 |

**Lift: +40 pp** pass rate (candidate minus baseline). Per-run candidate scores 90/85/88/83/76 %; baseline 63/60/64/66 % plus the re-run.

## Per case (pass rate)

| case | candidate | baseline |
|---|---|---|
| case-1 review-digest | 60% (3/5) | 20% (1/5) |
| case-2 review-notifications | 80% (4/5) | 80% (4/5) |
| case-3 mcp-review-score | 40% (2/5) | 60% (3/5) |
| case-4 hotspots | 100% (5/5) | 80% (4/5) |
| case-5 check-annotations | 60% (3/5) | 0% (0/5) |
| case-6 release-notes | 100% (5/5) | 0% (0/5) |
| case-7 weekly-report | 80% (4/5) | 20% (1/5) |
| case-8 review-forecast | 80% (4/5) | 20% (1/5) |

## Practices that moved most (candidate vs baseline)

- case-6: `adapters/git/tags.ts` second `simpleGit` client: 100% vs 0%
- case-6: `adapters/llm/notes-writer.ts` raw `fetch` to the LLM API: 100% vs 0%
- case-1: `types.ts` importing `db/schema` (type-only): 80% vs 0%
- case-5: container wiring without `ContainerOverrides` field or mock: 40% vs 0%
- case-5: repository returning an un-executed query builder: 80% vs 20%
- case-7: `vendor/shared/weekly-report.ts` re-exporting from `adapters/report`: 100% vs 20%
- case-7: `_shared/week.ts` importing `drizzle-orm`/`db/schema`: 100% vs 40%
- case-8: `BriefLogger` consumer-port import: 100% vs 20%
- Against the skill: case-3 `tools/get-review-score.ts` own HTTP client: 40% vs 60%

## Analyst flags

- `always_failing` (0/5 in both configs): case-3 `core/threshold.ts` reading `process.env` inside `core/`.
- `cost_regression`: case-1, case-2, case-6, case-8 (the skill costs about 25% more output tokens overall: 9050 vs 7271).
- `flaky`: most skill-dependent positives (case-1 routes/service, case-3 tool client, case-4 astgrep import, case-5 service/wiring, case-7 forge-client/types/week, case-8 ports).
- `non_discriminating` (pass equally without the skill): 7 of the 10 "does not flag ..." negatives (not flagged: case-4 type-only `RepoIntel` 100% vs 80%, case-7 `RepoIntel`/`getContext` 100% vs 80%, case-8 `IndexState`/`RepoIntel` 100% vs 60%, flagged `flaky`), the "no depcruise claim" practice in every case, and easy positives such as case-3 `core/score.ts` importing `../tools`, case-4 `churn.ts`, case-6 `process.env` read, case-7 dynamic `import()` of the anthropic adapter, case-2 `slack.ts` importing `modules/reviews`.

## Reading

- The skill adds clear lift on the rules that need its vocabulary: second client per system (`one-adapter-per-system`), `ports-are-vendor-neutral`, db confined to repositories, consumer ports, and unmocked container wiring (cases 5-8).
- Obvious leaks (adapter importing a module, core importing the transport layer, `process.env` in a service) and most negative practices are found or respected without the skill (the case-8 negative drops to 60% without it), so those practices do not measure it.
- Case-3 is a miss: candidate scored below baseline on the HTTP-client practice, and the `core/threshold.ts` env practice failed in both configs; worth a look at the case or the skill's MCP-core guidance.
- The lift costs about 25% more output tokens and 25% more wall time; with n = 5 and many flaky practices, per-practice deltas of one or two runs are noise.
