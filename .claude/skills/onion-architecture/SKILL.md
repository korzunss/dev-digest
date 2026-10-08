---
name: onion-architecture
description: "Onion / ports-and-adapters layering for the DevDigest backend (server/ + reviewer-core/ + the mcp-server/ package, layout in layer-map.md section 7). Use when adding or reviewing a backend module — placing routes/services/repositories/adapters, deciding where a DB query or an external SDK call (LLM, GitHub, git, ripgrep, ast-grep) may live, wiring DI in platform/container.ts, defining a new port in @devdigest/shared, or keeping reviewer-core pure. Enforces the dependency rule (imports point inward) with edge checks and a proposed dependency-cruiser config. NOT for the client/ frontend (use frontend-architecture) or React code."
version: "1.0.0"
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
   allowed and established: an `import type` of a **service-local port** from the owning module's
   `types.ts` (`blast/service.ts` → `repo-intel/types.ts` for `RepoIntel`), because that file
   *is* the port's home. Don't flag it.

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
- `src/adapters/astgrep/index.ts` imports `modules/repo-intel/constants.js`
  (`SUPPORTED_EXT`, `MAX_SIGNATURE_CHARS`). This is an infra→module edge; the clean fix is to
  relocate those constants. No other adapter gets this exception.
- An `import type` of a service-local port from `<other>/types.ts` (see step 6).

**Drift** (real violations in existing code; not exhaustive, so verify before you cite it):
- `db/schema` outside a repository: the `routes.ts` of `polling`, `pulls`, `workspace` and
  `settings`, plus `reviews/run-executor`, `reviews/diff-loader`, `repos/helpers` and
  `settings/feature-models`.
- Cross-module value imports: about 20 edges, e.g. `conventions/service` →
  `settings/feature-models`, `skills/service`, `reviews/run-executor`; `polling`/`pulls`
  `routes` → `repos/helpers`; `repos/service` → `repo-intel/constants`; and
  `eval/replay-cli` → several modules.
- Cycles through the DI root (`container ↔ service`, for services that take `Container`),
  plus `agents/helpers ↔ agents/repository`.
