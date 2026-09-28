---
name: devdigest-appsec
description: DevDigest-specific trust boundaries and security checks for reviewing this repo's own implemented code (a local-first Fastify API, a Next.js studio, and the reviewer-core LLM pipeline). Used by the security-reviewer subagent to trace attacker-controlled input from a source to a sink across this repo's boundaries. Not a generic OWASP primer — the `security` skill covers that for a different (Express/Mongo/JWT) stack.
---

# devdigest-appsec

## Contents
- When to use
- Trust boundaries
- Checks index
- Decision tree
- Not applicable by design

## When to use
Load this when reviewing DevDigest's own implemented code (not a third-party
repo it clones) for a security defect: an HTTP route, a credentialed outbound
request, a subprocess call, a path built from repo/PR-derived input, the LLM
pipeline in `reviewer-core/`, or a secret. This skill holds the **knowledge**
— where this repo's trust boundaries sit and what to check at each; the
`security-reviewer` agent holds the **process** (modes, severity, the filter
pass, the output shape). Checks below point to `references/checks.md` unless
noted; LLM-pipeline checks point to `references/llm-pipeline.md`.

## Trust boundaries
- No auth by design: local-first, single user
  (`server/src/platform/container.ts:16,101` `LocalNoAuthProvider`).
- HTTP hardening: `server/src/app.ts:89-96` — helmet; CORS locked to
  `config.webOrigin` with `credentials: true`; rate limit 120/min (off under
  test); default content-type parsers only (JSON + `text/plain`).
- The API **listens on `0.0.0.0`** (`server/src/server.ts:29`) — no
  Host-header or Origin allowlist anywhere in `server/src`.
- Mutating request bodies are Zod objects (e.g.
  `server/src/modules/settings/routes.ts:53`).
- Untrusted content entering the app: diffs, PR title/body, comments, READMEs,
  cloned-repo files, imported community skills, LLM output.
- Prompt boundary: `reviewer-core/src/prompt.ts:16-33` (`INJECTION_GUARD`,
  `wrapUntrusted`), PR-description cap `:37`, wrapped sections `:139-170`.
- Credentialed outbound host choice:
  `server/src/modules/settings/constants.ts:50-72` (`resolveTestApiBase`,
  allowlist checked before any hint), used at
  `server/src/modules/settings/routes.ts:91`.
- Git never runs repo code; argv validated as raw strings before any git call:
  `server/src/adapters/git/simple-git.ts:24,141-153`.
- Subprocess argv: `server/src/adapters/codeindex/ripgrep.ts:60`.
- SSRF guard for skill imports: `server/src/modules/skills/helpers.ts:281-300`.
- Secrets chokepoints: `server/src/adapters/secrets/local.ts`,
  `server/src/platform/config.ts`.

## Checks index
Per-check how-to, what to quote, and typical false positives:
[references/checks.md](references/checks.md). LLM-pipeline detail:
[references/llm-pipeline.md](references/llm-pipeline.md).

| X# | Boundary | OWASP 2025 | ASVS 5.0 | Reference |
|---|---|---|---|---|
| X1 | HTTP input through the route's Zod schema — no raw `req.body`/`req.query`, Content-Type enforced | A05 | V2, V4 4.1.1 | checks.md |
| X2 | Credentialed/user-directed outbound URL: allowlist checked before any hint, http(s) only | A01 (SSRF) | V13 13.2.4/13.2.5, V5 5.3.2 | checks.md |
| X3 | Paths: raw-string checks before `new URL`/`join`, realpath both sides, `..`/`\0`/leading `-`, zip-slip | A01 | V5 5.3.2/5.3.3 | checks.md |
| X4 | Subprocess: argv arrays, no shell, `--` before positional input, never run repo code | A05 | V1 1.2.5, V15 15.2.5 | checks.md |
| X5 | LLM input wrapped as untrusted before it reaches a prompt | A05 | LLM01 | llm-pipeline.md |
| X6 | LLM output handled as untrusted (no raw-HTML render, no shell/git/SQL use) | A08 | LLM05/06/02 | llm-pipeline.md |
| X7 | Secrets only via chokepoints, never in logs/responses/URLs/errors | A04, A09 | V13 13.3.1, V16 16.2.5 | checks.md |
| X8 | SQL: Drizzle builder or parameterised `sql`, no `sql.raw` with input | A05 | V1 1.2.4 | checks.md |
| X9 | Localhost exposure: non-loopback bind, no Host allowlist (DNS rebinding), loosened helmet/CORS/rate limit, side-effecting GET, non-object mutating body — CORS is not a CSRF control | A02 | V4 4.1.1/4.1.4 | checks.md |
| X10 | Dependencies: changed `package.json`, lock file from the right manager, offline `pnpm ls`/`npm ls`; the audit itself is *Checks not run* | A03 | V15 15.1/15.2† | checks.md |
| X11 | Error/log leakage, fail-open `catch` | A09, A10 | V16 16.5.1/16.5.3 | checks.md |

`†` ASVS sub-id approximate, not fetched verbatim (see
[references/sources.md](references/sources.md)).

## Decision tree
Changed file/path → rows to run:
- `*/routes.ts`, request schemas → X1, X9
- Anything building an outbound URL from user/PR input, or resolving a forge
  host/API base → X2
- Anything joining a path from a repo/PR-derived string, an archive
  extraction, a clone path → X3
- `child_process.spawn`/`exec`/`execFile`, ripgrep/ast-grep/git CLI calls → X4
- `reviewer-core/**`, prompt assembly, anything consuming LLM output → X5, X6
  (open [references/llm-pipeline.md](references/llm-pipeline.md))
- Anything reading/writing a secret, a log line, an error response → X7, X11
- Raw `sql`/`sql.raw`, Drizzle query builders with interpolated strings → X8
- `server/src/app.ts`, `server/src/server.ts`, CORS/helmet/rate-limit config
  → X9
- `package.json`, lock files → X10
- **Every finding**, before it is reported → always open
  [references/never-report.md](references/never-report.md)

## Not applicable by design
- OWASP A07 (auth failures), ASVS V6 Authentication, V7 Sessions,
  V8 Authorization, V9 Tokens, V10 OAuth — N/A: local-first, single user, no
  auth by design.
- ASVS V17 WebRTC — N/A: no WebRTC in this repo.

Full source list and licensing notes:
[references/sources.md](references/sources.md).
