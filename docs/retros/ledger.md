# Fan-out ledger

One row per parallel fan-out (worktrees run by separate agent sessions and merged
into one verified branch). Every number is measured from a named source; a value
that cannot be sourced is `n/a`, never estimated. Do not compare against an
invented "sequential" estimate — compare measured runs only.

**Columns**
- *Agents cost* — weighted tokens of each session's main transcript plus its
  subagents (`weighted = input + 1.25·cache_creation + 0.1·cache_read + 5·output`,
  the metric of `.claude/skills/sdd/scripts/usage-weights.mjs`), deduplicated by
  message id. Dollars are `n/a` on the subscription backend.
- *Wall-clock* — first transcript message of the earliest session → the target
  branch green after the last merge.
- *Overlap* — 5-minute buckets in which both sessions logged activity.
- *Conflicts* — files / hunks reported by the merges into the fan-out branches.
- *Human review* — the user's own estimate (not measurable from logs).
- *Re-runs* — fix-mode rounds and repeated review/verification passes after the first implementation.

| Date | Fan-out | Target | PRs | Agents cost (weighted tokens) | Wall-clock start → green merge | Active / overlap | Conflicts | Human review | Re-runs | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-15 | L07: A multi-agent review (plan 40, SPEC-13) ‖ B export-to-CI (plan 41, SPEC-14) | `L07` | A [#31](https://github.com/korzunss/dev-digest/pull/31) · B [#32](https://github.com/korzunss/dev-digest/pull/32) | A 27.7 M (main 12.9 M + 45 subagents 14.8 M) · B 25.9 M (main 12.6 M + 25 subagents 13.3 M) · **total 53.5 M** | 2026-10-14T13:29:10Z → 2026-10-15T13:30:00Z (**24 h 01 min**, incl. overnight idle) | A ≈ 350 min active · B ≈ 310 min · **overlap ≈ 225 min** (2026-10-14T16:40Z → 2026-10-15T13:30Z) | A ← L07: 0 · B ← L07 (after A): **15 files / 49 hunks** (31 hunks in migration snapshots) | A 10 min · B 10 min · **total 20 min** | A: 1 design-fix round (DG1–8), 6 fix-mode rounds (SK/H1, GR1, UF wave G9–G10, AC15C/SK-S23/F1/H2, pr-self-review ×3), 2 test-writer proof runs · B: 5 fix-mode rounds + MERGE-1, 3 `/pr-self-review` runs | Merge order A → B kept, but B's ingest uses nothing from A (`server/src/modules/ci/repository.ts:314-331`). MERGE-1: B filtered CI runs out of A's estimates (`source='local'`). Product check A 1 vs 3 agents on PR #12: wall-clock 1.82×, cost 2.71×, conflicts 0 → 2 (plan 40 *Verification log*, S20). Subagent `output` tokens in transcripts are known to be under-reported (root `INSIGHTS.md` 2026-10-08), so the subagent share is a lower bound. |

**Sources:** session transcripts under `~/.claude/projects/` (A `26541aca-…`, B `2dd8f9c5-…`) read for `usage` and `timestamp` only; `git log` of `origin/L07` (`6ffbddb` A merged 12:44:36Z, `f9b5283` B merged 13:27:27Z); full check of `origin/L07` finished 13:30:00Z (client 754, server 1467 unit + `.it`, mcp-server 65, reviewer-core 225, agent-runner 37, typecheck ×6, `verify:l06`); B's figures as reported by session B; plans 40 and 41 *Verification log*.

**Skill gap (future change):** `workflow-retro` does not compute session overlap, conflict counts, human review time or append to this ledger (plan 29 left the ledger out), and it attributes cost only to sessions logged through `sdd.sh`. This row was filled by hand from the sources above.
