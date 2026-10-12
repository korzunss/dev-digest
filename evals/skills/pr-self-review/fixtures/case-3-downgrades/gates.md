Base: `git merge-base origin/main HEAD` = 5f6da15. Branch: feat/digest-schedule.

Changed files (after the routing.md §1 skip list):

    M server/src/modules/digest/routes.ts
    A server/src/modules/digest/schemas.ts
    M server/src/modules/digest/service.ts
    A client/src/components/digest-schedule/ScheduleForm.tsx
    M client/src/lib/api/digest.ts

Five files in two buckets, so the review was fanned out (one analyzer subagent per bucket).
The client files are not shown; their analyzer's findings are below.

Deterministic gates (gate.md §1 order), for `server/` and `client/`:

    server  $ npm run typecheck   # exit code 0
    server  $ npm run test        # exit code 0   (41 files, 315 tests passed)
    client  $ npm run typecheck   # exit code 0
    client  $ npm run test        # exit code 0   (58 files, 402 tests passed)
    lint / depcruise — not defined in either package

Raw findings returned by the analyzer subagents (step 3), not yet normalized or verified:

```json
[
  { "file": "server/src/modules/digest/routes.ts", "line": 22, "severity": "CRITICAL", "skill": "security",
    "issue": "req.body.cron and req.body.recipients are used without a Zod parse: unvalidated external input reaches the service",
    "fix": "call DigestScheduleInput.parse(req.body) before using it" },
  { "file": "server/src/modules/digest/routes.ts", "line": 19, "severity": "CRITICAL", "skill": "fastify-best-practices",
    "issue": "the route declares no response schema, so Fastify cannot use fast-json-stringify for it",
    "fix": "add response: { 204: z.null() } to the route schema" },
  { "file": "server/src/modules/digest/service.ts", "line": 18, "severity": "HIGH", "skill": "drizzle-orm-patterns",
    "issue": "one awaited INSERT per recipient inside a loop",
    "fix": "insert all recipients in one batched statement" },
  { "file": "client/src/components/digest-schedule/ScheduleForm.tsx", "line": 12, "severity": "MEDIUM", "skill": "frontend-architecture",
    "issue": "the CRON_PRESETS literal is declared inside the component file",
    "fix": "move it to the component folder's constants.ts" }
]
```
