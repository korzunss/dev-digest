# Routing — diff scope + file→skill map

How the orchestrator decides *what* to review and *which skills* to apply. Read together with
[SKILL.md](SKILL.md) (procedure) and [gate.md](gate.md) (the gate).

## 1. Diff scope

```
BASE="$(git merge-base origin/main HEAD)"
```

"All open changes" = everything not yet on `main`, including the working tree:

| Source | Command |
|--------|---------|
| Committed-not-merged + staged + unstaged | `git diff "$BASE"` |
| Untracked files | `git ls-files --others --exclude-standard` |

**Review added/modified lines only.** Do not flag pre-existing problems on lines the diff
doesn't touch — even inside a changed file. A self-review must never block a PR for legacy
code the author didn't write. Use the hunk ranges from `git diff "$BASE"` to bound findings.

### Always skip
- `**/vendor/shared/**` — generated/vendored (see do-not-touch in CLAUDE.md). *Exception:* it
  still feeds the contract-drift check below — read, never flag style.
- `**/db/migrations/**` — do-not-touch.
- `node_modules/`, `dist/`, `.next/`, lockfiles (`*-lock.json`, `pnpm-lock.yaml`).
- Pure docs: `*.md` / `*.json` with no executable code.

## 2. Buckets

| Bucket | Path globs |
|--------|-----------|
| **UI / frontend** | `client/**/*.{tsx,ts,css}` |
| **Backend / domain** | `server/**/*.ts`, `reviewer-core/**/*.ts` |
| **E2E / tests** | `e2e/**`, `**/*.test.ts(x)`, `**/*.it.test.ts` |

A `.ts`/`.tsx` file is always *also* in the full-stack pass (TS / Zod / security).

## 3. Skill map

### UI bucket
- `frontend-architecture` — where code lives, component splitting, App Router organization.
- `react-best-practices` — anti-patterns, hooks rules, derive-don't-store (CRITICAL/HIGH/MEDIUM).
- `next-best-practices` — RSC boundaries, data fetching, server/client component rules.
- `vercel-react-best-practices` — runtime performance, bundle.
- `react-testing-library` — **test files only**; style-level, never blocks.

### Backend bucket
- `onion-architecture` — layering / dependency rule; this is the "domain architecture" gate.
- `fastify-best-practices` — routes, plugins, schema validation, error handling.
- `drizzle-orm-patterns` — db queries, transactions, schema.
- `postgresql-table-design` — schema/index/constraint review (migrations are read-only).
- `nodejs-best-practices` — async, security, architecture decisions.

### Full-stack (runs on any changed `.ts`/`.tsx`)
- `typescript-expert` · `zod` · `security`.

### Always feed
- The touched package's `insights/gotchas.md` (`client/`, `server/`, `reviewer-core/`, `e2e/`) —
  the rules in force for that code become extra review criteria. Open the linked
  `INSIGHTS.md` entry only when a finding needs its reasoning.

## 4. Contract-drift check (project-specific CRITICAL)

`@devdigest/shared` contracts are vendored into **two** copies that must stay in sync:

```
client/src/vendor/shared/contracts/*.ts
server/src/vendor/shared/contracts/*.ts
```

If the diff touches a contract file in one copy but not the matching file in the other — or
the two copies differ for a touched contract — that is a CRITICAL (client/server contract
drift). Compare the matching pair:

```
git diff --no-index client/src/vendor/shared/contracts/<name>.ts \
                     server/src/vendor/shared/contracts/<name>.ts
```

Per CLAUDE.md these files are do-not-touch by hand, so drift usually means a regeneration step
was missed — surface it, don't try to patch one side.
