# Insights — `@devdigest/reviewer-core`

Append-only. Things that cost someone time in the engine. Repo-wide findings go
in [`../INSIGHTS.md`](../INSIGHTS.md), which carries the entry format, the section
guide and the promotion rule (a standing rule becomes one line under `Gotchas` in
`reviewer-core/CLAUDE.md`). The `engineering-insights` skill writes here.

```md
### YYYY-MM-DD — short title
**Symptom:** what you observed.
**Cause:** why it happened.
**Rule:** what to do from now on.
**Evidence:** `path/to/file.ts:42` · command · error string
```

---

## What Works

_Nothing yet._

## What Doesn't Work

_Nothing yet._

## Codebase Patterns

_Nothing yet._

## Tool & Library Notes

_Nothing yet._

## Recurring Errors & Fixes

### 2026-09-17 — findings vanish between the model response and the stored review

**Symptom:** the model returns several findings; the persisted review shows fewer,
or none, and the score doesn't match what the model reported.
**Cause:** working as designed. `groundFindings()` drops any finding that doesn't
cite a line present in the diff, and the score is recomputed from the survivors.
**Rule:** when findings disappear, inspect `groundingSummary()` before suspecting
the model or the transport. Don't loosen the gate to make findings reappear —
that's the one mechanism preventing hallucinated locations.
**Evidence:** `src/grounding.ts`

## Session Notes

_Nothing yet._

## Open Questions

_Nothing yet._
