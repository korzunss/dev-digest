# Plan 28 — cost report (subagent token usage)

Source: `sdd.sh usage-scan` → `.sdd/usage.jsonl` (subagent transcripts of session `02848fd1`; no content read). Main-session tokens are not included. All subagent runs are logged with `sdd.sh agent`, including the `/pr-self-review` analyzers (stage `self-review`). Token counts only — no dollar figure is computed here.

| Stage | Agent | Model | Input | Output | Cache read | Cache write | Msgs |
|---|---|---|---:|---:|---:|---:|---:|
| spec-p1 | spec-creator | claude-opus-5-5 | 14 | 4,748 | 292,478 | 66,062 | 7 |
| spec-p2 | spec-creator | claude-opus-5-5 | 44 | 19,342 | 1,117,596 | 406,548 | 17 |
| research | researcher | claude-sonnet-5-5 | 50 | 322 | 2,068,728 | 131,824 | 25 |
| plan-p1 | implementation-planner | claude-opus-5-5 | 18 | 406 | 354,567 | 59,141 | 9 |
| plan-p2 | implementation-planner | claude-opus-5-5 | 184 | 25,967 | 16,550,481 | 1,077,570 | 88 |
| plan-approve | general-purpose | claude-sonnet-5-5 | 32 | 280 | 1,221,799 | 106,252 | 16 |
| plan-approve | general-purpose | claude-fable-5-1 | 290 | 377 | 854,951 | 156,149 | 10 |
| implement | implementer | claude-sonnet-5-5 | 38 | 968 | 1,144,205 | 87,864 | 19 |
| implement | implementer | claude-sonnet-5-5 | 58 | 359 | 2,193,037 | 120,478 | 29 |
| implement | implementer | claude-sonnet-5-5 | 32 | 527 | 688,619 | 134,531 | 15 |
| implement | implementer | claude-sonnet-5-5 | 26 | 380 | 780,257 | 83,678 | 13 |
| tests | test-writer | claude-sonnet-5-5 | 52 | 386 | 2,616,449 | 123,285 | 26 |
| review | architecture-reviewer | claude-opus-5-5 | 30 | 121 | 739,559 | 65,485 | 15 |
| review | security-reviewer | claude-opus-5-5 | 26 | 100 | 684,359 | 76,985 | 13 |
| review | plan-verifier | claude-opus-5-5 | 52 | 607 | 2,297,009 | 137,544 | 26 |
| fix-loop | implementer | claude-sonnet-5-5 | 20 | 106 | 371,567 | 49,468 | 10 |
| review | plan-verifier | claude-opus-5-5 | 32 | 144 | 430,689 | 29,257 | 16 |
| docs | doc-writer | claude-sonnet-5-5 | 16 | 5,373 | 325,106 | 62,047 | 8 |
| self-review | general-purpose | claude-sonnet-5-5 | 16 | 3,315 | 329,895 | 75,631 | 7 |
| self-review | general-purpose | claude-sonnet-5-5 | 10 | 336 | 209,105 | 67,094 | 5 |
| fix-loop | implementer | claude-sonnet-5-5 | 14 | 135 | 180,084 | 31,962 | 7 |
| review | plan-verifier | claude-opus-5-5 | 24 | 106 | 321,521 | 43,181 | 12 |
| implement | implementer | claude-sonnet-5-5 | 20 | 204 | 304,136 | 41,791 | 10 |
| implement | implementer | claude-sonnet-5-5 | 48 | 1,190 | 1,892,163 | 102,286 | 24 |
| review | plan-verifier | claude-opus-5-5 | 46 | 1,267 | 1,408,552 | 99,914 | 23 |
| review | architecture-reviewer | claude-opus-5-5 | 28 | 310 | 636,870 | 59,877 | 14 |
| fix-loop | implementer | claude-sonnet-5-5 | 12 | 111 | 145,084 | 22,128 | 6 |
| review | plan-verifier | claude-opus-5-5 | 18 | 68 | 237,570 | 27,751 | 9 |
| self-review | general-purpose | claude-sonnet-5-5 | 10 | 65 | 186,647 | 56,477 | 5 |
| implement | implementer | claude-sonnet-5-5 | 26 | 489 | 600,765 | 67,599 | 13 |
| review | plan-verifier | claude-opus-5-5 | 38 | 434 | 1,032,302 | 82,461 | 19 |
| self-review | general-purpose | claude-sonnet-5-5 | 12 | 96 | 213,311 | 54,165 | 6 |
| self-review | general-purpose | claude-sonnet-5-5 | 30 | 201 | 1,097,203 | 116,189 | 15 |
| self-review | general-purpose | claude-sonnet-5-5 | 12 | 93 | 289,856 | 83,673 | 6 |
| self-review | general-purpose | claude-sonnet-5-5 | 16 | 47 | 351,808 | 67,158 | 8 |
| self-review | general-purpose | claude-sonnet-5-5 | 16 | 68 | 477,150 | 96,407 | 8 |
| tests | test-writer | claude-sonnet-5-5 | 22 | 154 | 759,324 | 95,970 | 11 |
| docs | doc-writer | claude-sonnet-5-5 | 16 | 257 | 272,207 | 50,152 | 8 |
| review | plan-verifier | claude-opus-5-5 | 22 | 100 | 366,293 | 51,765 | 11 |
| **total** | 39 runs | | 1,470 | 69,559 | 46,043,302 | 4,367,799 | |

## By stage

| Stage | Output | Cache read | Cache write |
|---|---:|---:|---:|
| spec-p1 | 4,748 | 292,478 | 66,062 |
| spec-p2 | 19,342 | 1,117,596 | 406,548 |
| research | 322 | 2,068,728 | 131,824 |
| plan-p1 | 406 | 354,567 | 59,141 |
| plan-p2 | 25,967 | 16,550,481 | 1,077,570 |
| plan-approve | 657 | 2,076,750 | 262,401 |
| implement | 4,117 | 7,603,182 | 638,227 |
| tests | 540 | 3,375,773 | 219,255 |
| review | 3,257 | 8,154,724 | 674,220 |
| fix-loop | 352 | 696,735 | 103,558 |
| docs | 5,630 | 597,313 | 112,199 |
| self-review | 4,221 | 3,154,975 | 616,794 |

## By model

| Model | Input | Output | Cache read | Cache write |
|---|---:|---:|---:|---:|
| claude-opus-5-5 | 576 | 53,720 | 26,469,846 | 2,283,541 |
| claude-sonnet-5-5 | 604 | 15,462 | 18,718,505 | 1,928,109 |
| claude-fable-5-1 | 290 | 377 | 854,951 | 156,149 |

## Flags (`sdd.sh flags 28`)

- F1 — weighted tokens above the median of earlier plans in three stages: `implement` 1,578,935 (median 618,272), `plan-p2` 3,132,030 (median 1,332,726), `spec-p2` 716,699 (median 279,527). Cause: three post-implementation rounds (cross-model fixes, design conformance G5/G6, coverage G7) re-ran the same planner and spec-creator with growing context. `repeat:` F1 across plans 24, 25, 26, 28.
- F3 — one hand-back recorded as "unknown" (G1 used `| Step |` instead of `| Step / gap |`); the main session read the diff and re-ran typecheck and tests.

## Rounds

- Review: full plan-verifier pass (154/158) → fix-loop 1 (T3, T6, T10, F1, H1, SEC1) → delta (158/158).
- Pre-PR self-review: 1 HIGH (SR1) → fix-loop 2 → delta (158/158).
- Design conformance after a live check (spec AC-46..50, plan G5/G6): delta incomplete (AC-30 bullets, T13, SK16) → fix-loop 3 → delta complete; self-review 0 critical, SR8/SR9 main-session fixes.
- Coverage round (spec AC-13/22/46/47, plan G7): implementer → delta complete (46/46).
- Process gaps: test-writer for G5–G7 + doc-writer refresh → delta complete (17/17).

## Product-side model calls

Generating a brief makes exactly one `completeStructured` call with the `risk_brief` model (AC-3), logged as one line `brief: <provider>/<model> tokens <in>/<out> cost <usd> duration_ms <d>` (AC-9), stored as `usage` on the brief and shown as the "Brief" cost line (AC-48/49); input ≤ 8,000 tokens including an 800-token schema reserve (AC-11).
