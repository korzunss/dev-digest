# Insights — `@devdigest/reviewer-core`

Append-only, newest first. Things that cost someone time in the engine.
Repo-wide findings go in [`../INSIGHTS.md`](../INSIGHTS.md), which also carries
the entry format and the promotion rule (a recurring entry becomes one line under
`Gotchas` in `reviewer-core/CLAUDE.md`).

```md
## YYYY-MM-DD — short title
**Symptom:** what you observed.
**Cause:** why it happened.
**Rule:** what to do from now on.
```

---

## 2026-09-17 — findings vanish between the model response and the stored review

**Symptom:** the model returns several findings; the persisted review shows fewer,
or none, and the score doesn't match what the model reported.
**Cause:** working as designed. `groundFindings()` drops any finding that doesn't
cite a line present in the diff, and the score is recomputed from the survivors.
**Rule:** when findings disappear, inspect `groundingSummary()` before suspecting
the model or the transport. Don't loosen the gate to make findings reappear —
that's the one mechanism preventing hallucinated locations.
