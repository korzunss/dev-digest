# Plan 28 — workflow retro (PR Brief, SPEC-10)

Date: 2026-10-06 · Session `02848fd1` · Execution: multi-agent (G1–G7) · Sources: the plan's Verification log, `sdd.sh usage-scan` / `flags` ([cost-report.md](cost-report.md)), [plan-verifier-report.md](plan-verifier-report.md), [cross-model-review.md](cross-model-review.md).

The repo has no standalone `/workflow-retro` skill: plan 23 replaced it with no-LLM metrics (`usage-scan`, `flags`) plus a model review on demand when a flag repeats. This file is that on-demand review for plan 28, written by the main session.

## 1. What happened

| Phase | Rounds | Outcome |
|---|---|---|
| Spec (spec-creator) | pass 1 (8 questions, all answered with the recommended option) → pass 2 → 4 amendments (GAP1–3; cross-model X3/X7/X11; design conformance AC-46..50; coverage round AC-13/22/46/47) | 5 approvals, 50 ACs |
| Research (researcher) | 1 run, 8 questions | found 4 spec↔code tensions before planning |
| Plan (implementation-planner) | pass 1 → pass 2 → cross-model fixes → G5/G6 → G7 | 4 approvals, 24 steps in 7 groups |
| Cross-model plan review | Sonnet 5.5 (Y1–12) ∥ Fable 5.1 (X1–15) | 2 BLOCKER-class issues fixed before code (X1 guard released during a paid call, X2 no-key test could reach a real key) |
| Implementation | G1 → G2 ∥ G3 → G4 → (post-done) G5 → G6 → G7 | 7 implementer runs + 3 fix-mode runs |
| Verification | 7 plan-verifier passes (1 full, 6 delta), 2 architecture, 1 security | final: complete, AC-1..50 |
| Pre-PR | `/pr-self-review` ×3 (plan-28 scope, G5/G6 delta, full branch) | PASS, 0 critical; 1 HIGH fixed (SR1), 2 HIGH filed in plans 25/26 |
| Commits | spec+plan (`76c63a5`) before code (`4cae6be`), follow-ups (`c50bff3`), tests/docs (`2c1c407`) | P2 "spec and plan before code" met |

## 2. Cost

39 logged subagent runs. Weighted tokens (`input + 1.25·cache_write + 0.1·cache_read + 5·output`), total ≈ 10.4 M:

| Stage | Runs | Share |
|---|---:|---:|
| plan-p2 (one resumed planner, 4 resumes) | 1 agent | **30.1 %** |
| review (plan-verifier ×7, architecture ×2, security ×1) | 10 | 16.1 % |
| implement | 7 | 15.2 % |
| self-review analyzers | 8 | 10.6 % |
| spec-p2 (one resumed spec-creator, 5 resumes) | 1 agent | 6.9 % |
| tests | 2 | 5.9 % |
| plan-approve (cross-model reviewers) | 2 | 5.2 % |
| research, docs, fix-loop, spec-p1, plan-p1 | 9 | 9.9 % |

Flags: **F1** in `implement`, `plan-p2`, `spec-p2` (each 2–2.5× the median of earlier plans); `repeat: F1` across plans 24, 25, 26, 28. **F3** ×1 (G1 hand-back used `| Step |`, not `| Step / gap |`; the main session read the diff instead).

## 3. What worked

- **Questions with a recommended default.** spec pass 1, planner pass 1 and the cross-model triage were each closed in one AskUserQuestion round — the user took the recommendation every time.
- **Cross-model review before code.** It caught defects no test would have caught at that stage (X1, X2, X3 budget unsatisfiable, Y5/X5 navigation on mount). Cost: 5.2 %.
- **plan-verifier as the last line.** It caught what green suites hide: ACs claimed by a Tests row but not asserted (T3/T6/T10), a missing visual requirement (AC-30 bullets), a placement claim proven by presence only (T13).
- **Delta verification + fix mode** are cheap (fix-loop 1.9 % of tokens) and kept every round bounded.
- **Parallelism.** G2 ∥ G3 ∥ G4 and the three reviewers in parallel cut wall-clock time without file conflicts.

## 4. What did not work

1. **Design conformance found late — the largest loss.** The plan was closed as `done` three times and reopened twice (G5/G6: summary inside the banner, Review/Brief costs, card placement; G7: coverage block, Risk areas card), plus a main-session empty-state fix. Each reopen cost a full spec → plan → approve → implement → verify cycle. Root causes: no agent ever looked at the running UI (implementer: "compared only through tests"); the spec phrased layout loosely ("inside the PR Brief layout") instead of mapping each design region to an AC.
2. **Resumed agents accumulate context.** One planner carried 4 correction rounds (8.7 M cache-read tokens, 30 % of the run); one spec-creator carried 5. The plan brief grew to ~34.5 k characters (target ~20 k), and every implementer and verifier re-read it.
3. **Live-environment gaps tests cannot see.** `risk_brief` defaults to `openai` while every other feature uses `openrouter` (first live click → `no_key`); a failed generation shows only "Could not generate the brief" and logs only `err.name`, so it could not be diagnosed without the user's terminal.
4. **Main-session process slips.** test-writer skipped for G5–G7 (closed afterwards); a 3-file change done in the main session (rule: ≤1 file); self-review analyzers not logged at first (cost report incomplete until fixed); cross-model review used same-family models.
5. **Large branch.** `L05_risk_brief` carries plans 20–28 (+27 k lines); the full-branch self-review covered 205 files and its HIGHs came from other plans.
6. **Tooling friction.** Read-only reviewers cannot run `sdd.sh delta` (it writes git objects) — the workaround had to be repeated in four prompts; `handback-check` false negative on a header variant.

## 5. Proposed corrections

| # | Change | Where | Expected effect |
|---|---|---|---|
| P1 | **Live UI check before review**: after the last UI group, run the app (`run` skill / agent-browser), capture screenshots and give them to plan-verifier with the `--designs` images | `.claude/skills/sdd/stages.md`, `plan-verifier` prompt | would have removed the G5–G7 rounds |
| P2 | **Design → AC map in the spec**: for each design image, a table "region → AC" (banner, columns, cards, order) | `spec-creator` template | no loose layout ACs |
| P3 | **A post-`done` round is a new plan**, not an extension of the old one | `CLAUDE.md` → *Plan → implement → verify* | plan stays ≤ 20 k chars; fresh context |
| P4 | **Fresh agent instead of resume after approval**: resume only inside pass 1 → pass 2; later rounds start a new planner / spec-creator with the file path | `CLAUDE.md`, `sdd/SKILL.md` | ~30–40 % fewer tokens on this run's profile |
| P5 | **test-writer after every implementation wave** in multi-agent mode, with an AC → `file:line` map | `sdd/stages.md`, test-writer prompt | ACs pinned before verification |
| P6 | **`sdd.sh delta --ro`** (tracked `git diff <ref>` + per-file compare for untracked, no object writes) | `sdd.sh` | reviewers compute deltas themselves |
| P7 | **Cross-family plan review** via a small script that sends the plan through the existing OpenRouter adapter (GPT / Gemini) | `scripts/` | meets the "different model family" requirement |
| P8 | **Product**: `risk_brief` default → `openrouter`; surface the failure class (`invalid_output` / `timeout` / `provider`) in the UI | new spec + plan | fewer dead ends on a demo |
| P9 | **One PR per plan** (smaller branches) | process | reviewable PRs, scoped self-review |

P1 + P2 + P3 target the largest loss; P4 targets the repeating F1 flag.

## 6. Open items

- Cross-family plan review (P7 / homework P2 note) — still same-family only.
- `repeat: F1` (plans 24, 25, 26, 28): `/sdd` offers a `brainstormer` run on it; not run yet.
- Follow-ups in plan 28 (SR2–SR10, unused `prBrief.status.*` keys, designs 22/37 vs reversed AC-46) and the HIGHs filed in plans 25 and 26.
