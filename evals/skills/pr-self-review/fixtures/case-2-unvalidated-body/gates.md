Base: `git merge-base origin/main HEAD` = 5f6da15. Branch: feat/digest-schedule.

Changed files (after the routing.md §1 skip list):

    M server/src/modules/digest/routes.ts
    M server/src/modules/digest/service.ts

Two files, one bucket (backend), so no fan-out: review them inline.

Deterministic gates for `server/` (gate.md §1 order):

    $ npm run typecheck        # exit code 0
    > tsc --noEmit

    lint       — server/package.json defines no `lint` script
    depcruise  — server/.dependency-cruiser.cjs does not exist

    $ npm run test             # exit code 0
    > vitest run
     Test Files  41 passed (41)
          Tests  312 passed (312)
