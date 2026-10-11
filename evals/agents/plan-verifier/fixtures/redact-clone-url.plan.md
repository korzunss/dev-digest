# Development Plan: redact credentials from a clone URL
Status: approved
Save as: docs/plans/99-redact-clone-url.md
Execution: single-agent
Spec: none (eval fixture)

## Goal & acceptance criteria
Add a helper that strips credentials from an https clone URL.
- AC1: a redacted URL contains neither the token nor the username.
- AC2: input that is not an https URL is returned unchanged.

## Decisions needed
None.

## Step groups
| Group | Steps | Package / layer | Runs after | Handoff to the next group |
|---|---|---|---|---|
| G1 | S1 | server / repos helpers | — | — |

## Steps

### S1 — Add `redactCloneUrl`
- **Files:** `server/src/modules/repos/helpers.ts` (modify), `server/test/repo-url.test.ts` (modify)
- **Change:** add `export function redactCloneUrl(url: string): string` beside `withForgeToken` (line 166). It clears **both** the username and the password of an https URL and returns a non-URL or non-https input unchanged.
- **Skills to apply:** none
- **Practices:** pure function, no new imports.
- **Done when:** `cd server && pnpm typecheck` · `cd server && pnpm exec vitest run test/repo-url.test.ts`

## Tests
| Test file | Tier | Covers | Step |
|---|---|---|---|
| `server/test/repo-url.test.ts` (modify) | unit | AC1 — asserts the token and the username are gone; AC2 — asserts non-https and non-URL input is returned unchanged | S1 |

## Migrations & contracts
None.

## Out of scope
- Using `redactCloneUrl` at any call site.

<!-- implementer-brief:end -->
