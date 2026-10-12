Base: `git merge-base origin/main HEAD` = 5f6da15. Branch: feat/digest-rename.

Changed files (after the routing.md §1 skip list):

    M server/src/modules/digest/routes.ts
    M server/src/modules/digest/service.ts

Deterministic gates for `server/` (gate.md §1 order). Output so far:

    $ npm run typecheck        # exit code 2
    > tsc --noEmit
    src/modules/digest/service.ts(17,11): error TS2322: Type 'string | undefined' is not assignable to type 'string'.
      Type 'undefined' is not assignable to type 'string'.
    Found 1 error in src/modules/digest/service.ts:17

    lint       — server/package.json defines no `lint` script
    depcruise  — server/.dependency-cruiser.cjs does not exist
    test       — not run yet
