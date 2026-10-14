# Mutation report: `server/src/modules/eval/pipeline-scoring.ts` (plan 34, S21/S22)

Tool: Stryker 10.0.0 + vitest-runner, `cd server && pnpm mutation:eval-scoring`
(`server/stryker.config.json`, `inPlace: true`, vitest config `server/vitest.mutation.config.ts`).

Scope correction (review iteration 1): the first run used `mergeConfig`, which APPENDS `test.include`
to the base `test/**/*.test.ts`, so Stryker loaded 33 test files (integration ones included) and the
other suites hid weak spots in the scoring tests. The config now replaces `include` with
`test/eval-pipeline-scoring.test.ts` and excludes `**/*.it.test.ts`. Checked after each run:
`jq '.testFiles|keys' server/reports/mutation/mutation.json` gives `["test/eval-pipeline-scoring.test.ts"]`.
The `inPlace` run restored the source file both times (`shasum` of `pipeline-scoring.ts` identical before and after;
no `.stryker-tmp` left).

## Before (corrected scope, 20 scoring tests)
| Mutants | Killed | Timeout | Survived | No coverage | Score |
|---|---|---|---|---|---|
| 179 | 170 | 0 | 9 | 0 | 94.97 % |

## Survivors (before)
| Id | Mutator | Line | Original | Mutant | Verdict | Killed by |
|---|---|---|---|---|---|---|
| 80 | EqualityOperator | 113 | `s.status === 'passed'` | `s.status !== 'passed'` | real gap | `aggregateRun counts the passed cases, not the failed ones` |
| 119 | ConditionalExpression | 150 | `d === null` | `false` | equivalent | none possible |
| 129 | ConditionalExpression | 153 | `points > 0` | `true` | real gap | `regressionAlert lists a rise only for a metric that rose by a whole point` |
| 131 | EqualityOperator | 153 | `points > 0` | `points >= 0` | real gap | same test |
| 163 | MethodExpression | 190 | `.filter(...).slice().sort(...)` | `.slice()` removed | equivalent | none possible |
| 176 | ConditionalExpression | 193 | `a.startedAt > b.startedAt` | `true` | equivalent | none possible |
| 177 | ConditionalExpression | 193 | `a.startedAt > b.startedAt` | `false` | equivalent | none possible |
| 178 | EqualityOperator | 193 | `a.startedAt > b.startedAt` | `a.startedAt >= b.startedAt` | equivalent | none possible |
| 179 | EqualityOperator | 193 | `a.startedAt > b.startedAt` | `a.startedAt <= b.startedAt` | equivalent | none possible |

### Why the equivalents cannot be killed
- 176-179 (comparator, line 193): when `a.startedAt < b.startedAt` is false, V8's stable sort (TimSort) acts only on
  `order < 0` in its binary insertion and merge steps, so returning `0`, `1`, `true` or `false` gives the same order.
  Checked with a standalone script on 2..1000 elements and 2..10 distinct keys. Production code is not changed for them.
  Two tests in `describe('mutation survivors')` pin the contract the comparator must keep (ascending time, input order on ties).
- 119 (line 150): with `d === null` skipped, `Math.round(null * 100)` is `0`, so `points` is `0` and the metric lands in
  neither `dropped` nor `rose`. Same output for every input.
- 163 (line 190): `Array.prototype.filter` already returns a new array, so `.slice()` before `.sort()` is a redundant
  copy; the input array is not mutated with or without it.

## After (re-run, 22 scoring tests)
| Mutants | Killed | Timeout | Survived | No coverage | Score |
|---|---|---|---|---|---|
| 179 | 173 | 0 | 6 (all equivalent, listed above) | 0 | 96.65 % |

Targeted mutants 80, 129, 131: Killed. Survivors left: 119, 163, 176, 177, 178, 179, all equivalent.
Effective score excluding equivalents: 173 / 173 = 100 %.
