---
name: onion-architecture
description: "Onion / ports-and-adapters layering for the DevDigest backend (server/ + reviewer-core/ + the mcp-server/ package, layout in layer-map.md section 7). Use when adding or reviewing a backend module — placing routes/services/repositories/adapters, deciding where a DB query or an external SDK call (LLM, GitHub, git, ripgrep, ast-grep) may live, wiring DI in platform/container.ts, defining a new port in @devdigest/shared, or keeping reviewer-core pure. Enforces the dependency rule (imports point inward), env reads only at their chokepoints, and one adapter per external system, with a per-module check script (scripts/check-module.sh), a transitive import trace that finds leaks hidden behind modules/_shared, @devdigest/shared re-exports and dynamic import(), and imports of another module's consumer ports (scripts/trace-imports.mjs), and a proposed dependency-cruiser config. NOT for the client/ frontend (use frontend-architecture) or React code."
version: "1.3.0"
---

# Onion Architecture — DevDigest backend

The backend **already is** an onion / ports-and-adapters architecture; this skill names it,
maps it onto our files, and gives the checks that enforce it (a `dependency-cruiser` config is
proposed, not installed yet). Use it whenever
you add or review code under `server/`, `reviewer-core/` or `mcp-server/` (its layout: layer-map.md §7).

For provenance and the full reading list, see [README.md](README.md).

## The one rule

**All imports point inward.** A file may depend on layers more central than itself; it may
never depend on a layer further out. Coupling is always toward the core. This is the
Dependency Inversion Principle: inner layers declare interfaces (ports); outer layers
implement them; the composition root wires them together.

```
        ┌─────────────────────────────────────────────┐
        │  Transport (Fastify routes, plugins)          │  ← outermost
        │   ┌─────────────────────────────────────┐     │
        │   │  Infrastructure / Adapters           │     │
        │   │   src/adapters/* · db/* · repository │     │
        │   │   ┌─────────────────────────────┐    │     │
        │   │   │  Application (services)      │    │     │
        │   │   │   modules/*/service.ts       │    │     │
        │   │   │   ┌─────────────────────┐    │    │     │
        │   │   │   │  Ports (interfaces) │    │    │     │
        │   │   │   │  @devdigest/shared  │    │    │     │
        │   │   │   │   ┌─────────────┐   │    │    │     │
        │   │   │   │   │  Core       │   │    │    │     │
        │   │   │   │   │ reviewer-   │   │    │    │     │
        │   │   │   │   │ core (pure) │   │    │    │     │
        │   │   │   │   └─────────────┘   │    │    │     │
        │   │   │   └─────────────────────┘    │    │     │
        │   │   └─────────────────────────────┘    │     │
        │   └─────────────────────────────────────┘     │
        │       composition root: platform/container.ts  │
        └─────────────────────────────────────────────┘
```

The composition root (`platform/container.ts`) sits across the rings: it is the **only**
place allowed to know both a port and its concrete adapter, because its job is to bind them.

## Layer map (where code lives)

Full table with allowed/forbidden imports per layer and real file references:
→ **[layer-map.md](layer-map.md)**. Summary:

| Layer | Path | May import | Must NOT import |
|-------|------|-----------|-----------------|
| Core | `reviewer-core/src/**` | itself, shared contract **types** | any I/O: `fastify`, `drizzle-orm`, `octokit`, `simple-git`, `postgres`, `src/adapters/**`, `db/**` |
| Ports | `@devdigest/shared` (`src/vendor/shared/**`) | other shared types | anything concrete |
| Application | `modules/*/service.ts`, `run-executor.ts` | ports, `container`, own `repository`/`helpers` | `src/adapters/**` (concrete SDKs) |
| Infrastructure | `src/adapters/**`, `db/**`, `modules/*/repository*.ts` | ports, drivers/SDKs, `db/schema` | `modules/**` (a feature) |
| Composition root | `platform/container.ts` | everything (binds ports↔adapters) | — |
| Transport | `modules/*/routes.ts` + plugins | own `service`, `_shared`, contracts | `src/adapters/**`, `db/schema` (go through the service) |

## Decision framework (placing a change)

Apply in order:

1. **Is it an external call** (HTTP, DB, git, an LLM, a CLI like ripgrep/ast-grep)? It belongs
   behind a **port** in `@devdigest/shared/adapters.ts`, implemented by an **adapter** in
   `src/adapters/<kind>/`. Never call an SDK from a service or a route.
2. **Is it a DB query?** It lives in `modules/<name>/repository.ts` (or `repository/*.repo.ts`),
   the only files allowed to touch `db/schema` + `drizzle-orm`. Repositories return domain
   rows, never a query builder that the caller keeps chaining: a repository method that returns
   `this.db.select()…` without awaiting it lets the service reach `.limit()` and `.orderBy()`, so
   Drizzle has leaked into the application layer. Take the limit or order as a parameter and
   await inside. This includes **type-only** imports: `import type * as t from 'db/schema'` in
   `types.ts` is still a schema edge. Put a row type in `repository.ts` or `db/rows.ts`.
3. **Is it business orchestration?** It lives in `modules/<name>/service.ts` (heavy run logic
   in `run-executor.ts`). The service depends on **interfaces**, never on a concrete adapter
   class and never on SDK **types** either (`import type { Octokit } from 'octokit'` in a
   service is a leak; the payload type belongs in the shared port).
   **The house style for a new service** is a narrow `<Name>ServiceDeps` object: its repository,
   the ports it uses (`forge: (ref) => …`, `llm`, `repoIntel`), and plain functions. A
   `container.<name>` getter builds it, and that getter is the only place that knows both the
   service and `Container` (`intent`, `blast`, `smart-diff` and `brief` in `platform/container.ts`).
   Older services take the whole `Container` (`reviews`, `repos`, `conventions`). That is
   fine where it already exists, but a new module shouldn't copy it.
4. **Is it HTTP wiring?** `modules/<name>/routes.ts` only: Zod schema (request validation +
   response serialization) → call the service → map the result. No logic, no DB, no SDK.
5. **Pure domain logic** (diff → prompt → grounded findings, scoring)? It lives in
   `reviewer-core` and stays pure — its only outside contact is the injected `LLMProvider`.
6. **Cross-module need?** Reach the other capability through `container.*` (e.g.
   `container.repoIntel.*`, `container.agentsRepo`), never by importing another module's
   `service`, `helpers`, `constants` or `run-executor` **values**. One import across modules is
   allowed and established: an `import type` from another module's `types.ts` of what that
   module **provides** — the interface its own service implements and the types its methods
   return (`blast/service.ts` → `repo-intel/types.ts` for `RepoIntel`; `blast/helpers.ts` for
   `BlastResult`; `onboarding` for `IndexState`, `IndexCoverage`). Don't flag those.
   **Never import another module's *consumer ports*** (`no-foreign-consumer-ports`). Those are
   the interfaces a module declares in its `types.ts` for **its own dependencies** — the types
   named in its `*ServiceDeps`, plus the types they reference. For example, `brief/types.ts`
   declares `BriefBlastPort`, `BriefIntentPort`, `BriefSmartDiffPort`, `BriefAgentsPort`,
   `BriefContextPort`, `TokenCounter` and `BriefLogger` under "structural ports the service
   depends on". They are shaped to brief's needs and change when brief's needs change, so a
   second module that reuses them breaks on a brief refactor it never touched. They look exactly
   like the allowed case (an `import type` from `<other>/types.ts`), so check what the name
   *is*: find it in `<other>/service.ts`'s `*ServiceDeps`. The fix is a narrow port in **your
   own** `types.ts` (`export interface ForecastBlastPort { getBlast(…): … }`); structural typing
   means the container passes the same object, so nothing else changes.
7. **Does it read configuration or a secret?** `process.env` is read only at its chokepoints:
   `platform/config.ts` (`loadConfig()` → `AppConfig`, reached as `container.config`),
   `adapters/secrets/local.ts` (the `SecretsProvider` behind every API key and token),
   `adapters/git/simple-git.ts` (it sets `GIT_TERMINAL_PROMPT` for git subprocesses), and the
   CLI scripts `db/{migrate,seed,backfill-run-cost}.ts`. A new tunable is a field in
   `config.ts`'s `EnvSchema` + `AppConfig`; a new key goes through `SecretsProvider`. A
   `process.env` read anywhere else — a service, a route, a helper, **an adapter** — is a
   finding (`env-at-chokepoints`): tests can't override it through `ContainerOverrides`, the
   value skips zod validation, and a key read that way also skips the UI-managed secrets store.
   A draft that adds the field to `config.ts` *and* still reads `process.env` at the call site
   is the common half-done version: flag the call site, not the config.
8. **Is there already an adapter for that system?** One external system has **one** adapter,
   and everything else goes through its port: git → `SimpleGitClient` (`adapters/git/simple-git.ts`,
   `container.git`), GitHub → `OctokitGitHubClient` via `container.forge(ref)`, LLMs →
   `container.llm(id)`. A second client for the same system — another `simpleGit(…)`, another
   `new Octokit(…)`, a `new Anthropic(…)` / `new OpenAI(…)` outside `adapters/llm/`, or a raw
   `fetch` to the same API — is a finding (`one-adapter-per-system`), **even when it sits in
   `src/adapters/` and is wired through the container**. It bypasses what the owner enforces:
   `SimpleGitClient`'s per-clone lock and `AbortSignal` kill path, the forge's per-repo token
   and host resolution, the LLM adapters' retry, timeout, cost and trace handling. The fix is a
   new method on the existing port (e.g. `GitClient.listTags(ref)`), implemented in the owning
   adapter and its mock.

## Adding a new external dependency (the canonical move)

1. **Define the port first** — an interface in `src/vendor/shared/adapters.ts` that speaks the
   application's language ("I need to post a review comment"), with **no** vendor name in it.
2. **Implement the adapter** in `src/adapters/<kind>/<impl>.ts` that wraps the SDK.
3. **Add a mock** in `src/adapters/mocks.ts` (tests inject it).
4. **Wire it in the container** (`platform/container.ts`) as a lazy getter, and add a field to
   `ContainerOverrides` so tests can inject the mock. A getter with no override field, or an
   adapter with no mock, is a review finding: every `.it` test that reaches it then calls
   the real service. Token lookup belongs inside the container too. For anything on a forge,
   resolve per repo with `container.forge(ref)` rather than reading `GITHUB_TOKEN` yourself.
5. Services consume `container.<port>` — they never see the SDK.

This is exactly how `LLMProvider`, `GitHubClient`, `GitClient`, `CodeIndex`, `Embedder`,
`AuthProvider`, and `SecretsProvider` already work.

## Enforcement — how to check today

### Trace imports transitively — a clean import line proves nothing

A file's own import lines can all be clean while the file still depends on an adapter or on
`db/schema`, because the edge sits **one hop away**, where a one-file grep never looks:

- **`modules/_shared/`** — a helper there that imports an adapter or `drizzle-orm` /
  `db/schema` makes every module that imports the helper depend on it. `_shared` is outside
  the module folder, so `check-module.sh <mod>` does not search it.
- **`@devdigest/shared`** — the ports package may hold only types, Zod contracts and
  interfaces. An `export { x } from '../../adapters/…'` (or any import of `adapters/`,
  `modules/`, `platform/` or an SDK) in a shared file turns every
  `import { x } from '@devdigest/shared'` into a hidden adapter import. Flag it in the shared
  file as `ports-are-vendor-neutral`.
- **Re-exports** (`export … from`, `export type … from`): a re-export is an import. A local
  `types.ts` that re-exports another module's `repository.ts` row type is a cross-module edge.
- **Non-static imports**: `await import('…')`, `require('…')`,
  `createRequire(import.meta.url)('…')` and the type form `import('…').T`. Searches for
  `from '…'` miss all of them.

So for every changed server file, follow each import until it reaches a layer the file may not
depend on, or a layer that ends the walk (an adapter, `db/`, another module, the container,
the own repository). **Report the edge where it actually is** (the `_shared` / shared file
line, the dynamic `import()` line), and name the changed file that reaches it. The bundled
tracer does this on the TypeScript AST:

```bash
node .claude/skills/onion-architecture/scripts/trace-imports.mjs <files or dirs>...                 # this repo
node .claude/skills/onion-architecture/scripts/trace-imports.mjs <files or dirs>... --root <draft>   # a draft laid out at repo paths
```

Pass **every** changed file, including new `modules/_shared/*`, `vendor/shared/*` and
`adapters/*` files. It prints one chain per leaking edge, for example
`modules/x/service.ts:4 → modules/_shared/forge-client.ts:2 → adapters/github/octokit.ts`.
It also flags an `import type` from another module's `types.ts` that names one of that module's
consumer ports (`no-foreign-consumer-ports`, step 6), and prints the port names. It does not
read `.diff` files, so trace the edits in a diff by hand.

### Edge checks

**For one server module, run the bundled script first.** It runs every edge check below for
that module, plus the repo-wide adapter, second-client and env checks, and skips comment lines:

```bash
.claude/skills/onion-architecture/scripts/check-module.sh <module>               # this repo
.claude/skills/onion-architecture/scripts/check-module.sh <module> --root <dir>  # a draft laid out at repo paths
```

Each hit is a lead, not a verdict: match it against *Known exceptions* below and check
`git show HEAD:<file>` before you report it. It does not read `.diff` files, cover
`reviewer-core/` or `mcp-server/`, or tell value from type use beyond the `import type`
prefix, so read the changed files too.

**There is no dependency-cruiser gate in this repo yet.** `dependency-cruiser` is a
dependency of `server/`, but `server/.dependency-cruiser.cjs` and a `depcruise` script do not
exist. Don't run `npm run depcruise` or quote a gate result. [enforcement.md](enforcement.md)
is the *proposed* config, and its rule names are the vocabulary to cite in a finding.

Check a change by walking its imports by hand (`import type` included) and with explicit
edge searches over the changed files (`rg` is not on PATH here, so use `grep -rnE`):

```bash
grep -rnE "from '(\.\./)+adapters/" server/src/modules/<mod>        # services-depend-on-ports / routes-are-thin
grep -rnE "db/schema|drizzle-orm" server/src/modules/<mod>             # db-confined-to-repositories (expect repository.ts only)
grep -rnE "from '\.\./[a-z-]+/" server/src/modules/<mod>              # cross-module: keep only `import type` from <other>/types.ts
grep -rnE "modules/" server/src/adapters/<kind>                        # adapters-dont-know-modules
grep -rnE "process\.env" server/src --include=*.ts                    # env-at-chokepoints (expect only the step-7 chokepoints)
grep -rnE "simpleGit\(|new Octokit\(|new (OpenAI|Anthropic)\(" server/src   # one-adapter-per-system (one file each)
grep -rnE "from '(node:fs|drizzle-orm|octokit|simple-git|fastify|postgres)" reviewer-core/src   # core-is-pure
grep -rnE "process\.env|fetch\(|setTimeout|from '\.\./(http|tools)/" mcp-server/src/core   # mcp core (layer-map §7)
grep -rnE "process\.env|fetch\(|from '\.\./http/" mcp-server/src/tools mcp-server/src/server.ts
```

Call an edge *pre-existing* only after checking `git show HEAD:<file>`. A new file that
copies existing drift is still a new violation, because drift is a backlog to burn down, not
a precedent.

## Known exceptions & drift (do not "fix" silently)

**Exceptions** (legitimate; don't flag):
- `modules/repo-intel/service.ts` imports adapters (`codeindex/extract`, `astgrep`): repo-intel
  **is** the indexer subsystem. It behaves as infrastructure and is reached only through the
  `container.repoIntel` facade. No other module gets this exception.
- `src/adapters/astgrep/index.ts` and `src/adapters/depgraph/index.ts` import
  `modules/repo-intel/constants.js` (`SUPPORTED_EXT`, plus `MAX_SIGNATURE_CHARS` in astgrep).
  These are infra→module edges; the clean fix is to relocate those constants. No other adapter
  gets this exception.
- The `process.env` chokepoints in step 7, and the one SDK client per system in step 8.
- An `import type` from `<other>/types.ts` of what that module provides: its service interface
  and its result types (see step 6). Not its consumer ports.

**Drift** (real violations in existing code; not exhaustive, so verify before you cite it):
- `db/schema` outside a repository: the `routes.ts` of `polling`, `pulls`, `workspace` and
  `settings`, plus `reviews/run-executor`, `reviews/diff-loader`, `repos/helpers` and
  `settings/feature-models`.
- Cross-module value imports: about 20 edges, e.g. `conventions/service` →
  `settings/feature-models`, `skills/service`, `reviews/run-executor`; `polling`/`pulls`
  `routes` → `repos/helpers`; `repos/service` → `repo-intel/constants`; and
  `eval/replay-cli` → several modules.
- `reviews/diff-loader` imports `adapters/git/diff-parser` (a pure parser that sits in `adapters/`).
- A raw `fetch` in a service: `skills/service.ts` (`fetchSkillUrl`, the skill import by URL).
- Cycles through the DI root (`container ↔ service`, for services that take `Container`),
  plus `agents/helpers ↔ agents/repository`.
