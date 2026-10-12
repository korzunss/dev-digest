Base: `git merge-base origin/main HEAD` = 5f6da15. Branch: feat/digest-count.

Changed files (after the routing.md §1 skip list):

    M client/src/components/digest-panel/DigestPanel.tsx
    M client/src/components/digest-panel/DigestRow.tsx
    M client/src/lib/api/digest.ts
    M server/src/modules/digest/repository.ts

Four files in two buckets, so the review was fanned out (one analyzer subagent per bucket).
Only DigestPanel.tsx is shown; the other files produced no findings.

Deterministic gates (gate.md §1 order), for `client/` and `server/`:

    client  $ npm run typecheck   # exit code 0
    client  $ npm run test        # exit code 0   (58 files, 401 tests passed)
    server  $ npm run typecheck   # exit code 0
    server  $ npm run test        # exit code 0   (41 files, 312 tests passed)
    lint / depcruise — not defined in either package

Raw findings returned by the analyzer subagents (step 3), not yet normalized or verified:

```json
[
  { "file": "client/src/components/digest-panel/DigestPanel.tsx", "line": 9, "severity": "CRITICAL", "skill": "react-best-practices",
    "issue": "count is stored in state and synced from items.length in an effect: derived state stored instead of derived",
    "fix": "drop the state and the effect; use items.length directly" },
  { "file": "client/src/components/digest-panel/DigestPanel.tsx", "line": 12, "severity": "HIGH", "skill": "vercel-react-best-practices",
    "issue": "rowStyle is a new object on every render, so every DigestRow re-renders",
    "fix": "hoist the style object to module scope" }
]
```
