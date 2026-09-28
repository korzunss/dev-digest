# Checks — how to run each, per X row

## Contents
- X1 — HTTP input via Zod
- X2 — credentialed outbound URL
- X3 — paths
- X4 — subprocess argv
- X7 — secrets
- X8 — SQL
- X9 — localhost exposure
- X10 — dependencies
- X11 — error/log leakage

X5 and X6 (the LLM pipeline) are in
[llm-pipeline.md](llm-pipeline.md), not here.

## X1 — HTTP input via Zod
**How to check:** open the route's `schema: { body / query / params }`.
Fastify validates against it before the handler runs, so the finding is a
route with **no** schema on a field the handler reads, or a handler that
reaches past the parsed value (`req.raw`, an unparsed header) to get raw
input.
**Quote:** source = the unschemaed field access; sink = wherever it is used
(a URL, a path, a subprocess arg, a SQL fragment).
**False positives:** a field already narrowed by `.enum()`/`.url()` in the
Zod schema needs no further check; a GET route with no body needs no body
schema.

## X2 — credentialed outbound URL
**How to check:** find where a user- or PR-supplied host, URL, or "hint"
reaches a `fetch`/SDK call that also carries a stored credential (a PAT, an
API key). Confirm the allowlist check runs — and can reject — **before** the
hint is used to pick among allowed values; a hint may disambiguate among
trusted hosts, it must never be able to add one
(`server/insights/gotchas.md` → Security, 2026-09-23). Also confirm the
scheme is restricted to `http(s)`: `z.string().url()` alone passes `file:`
and other schemes.
**Reference implementation:** `server/src/modules/settings/constants.ts:50-72`
(`resolveTestApiBase`) — validates against `gitlabBases` first, throws on an
unknown host, only then is the result handed to `container.forge({ apiBase })`
(`server/src/modules/settings/routes.ts:91`).
**Quote:** source = the request field naming the host/URL; sink = the
credentialed request (name the header/PAT that would be sent).
**False positives:** a URL built entirely from `AppConfig`/env, with no
request-derived segment, is not attacker-controlled.

## X3 — paths
**How to check:** any `path.join`/`new URL` fed a repo- or PR-derived string
(a file path from a diff, an archive entry, a clone-relative path). Two
sequencing bugs to check for specifically:
- A `..`/null-byte/leading-`-` guard must run on the **raw string**, before
  `new URL()` or path normalisation — the WHATWG URL parser silently strips
  `..` segments, so a guard placed after it never fires
  (`server/insights/gotchas.md` → Security, 2026-09-23).
- A `realpath` containment check must resolve **both** the target and the
  allowed root before comparing (`p === root || p.startsWith(root + sep)`) —
  resolving only the target fails closed the moment the allowed root itself
  sits behind a symlink (`server/insights/gotchas.md` → Security, 2026-09-22).
**Reference implementation:** `server/src/adapters/git/simple-git.ts:141-153`
(`readFileAt`) — rejects a leading `-`, a null byte, a leading `/`, and a
`..` path segment, all on the raw string, before calling
`git(repo).raw(['show', ...])`.
**Known gap to re-check, not an established finding:**
`server/src/adapters/git/simple-git.ts:129-131` (`readFile`) joins `path`
into `clonePathFor(repo)` with none of the above guards — trace whether any
caller passes a repo/PR-derived `path` before reporting it; otherwise list it
under *Needs manual check*.
**Quote:** source = the raw joined/parsed string; sink = the file-system or
git call.
**False positives:** a path built only from server-controlled segments (a
fixed subfolder name, no injected segment).

## X4 — subprocess argv
**How to check:** every `spawn`/`execFile`/`exec` call. Args must be an
array (never a shell string via `shell: true` or string concatenation), the
executable path itself must not be attacker-controlled, and a
request/repo-derived value passed **positionally** needs a `--` separator
before it (or another guarantee it cannot be read as a flag).
**Known gap to re-check, not an established finding:**
`server/src/adapters/codeindex/ripgrep.ts:60` passes `pattern` positionally
with no `--` before it — a pattern starting with `-` could be read as an
`rg` flag. Trace the callers of `RipgrepCodeIndex.grep`; report a finding
only if an attacker-controlled string reaches `pattern` unescaped, otherwise
*Needs manual check*.
**Quote:** source = the argv element's origin; sink = the spawned command
line.
**False positives:** an argument that is always a fixed literal chosen by
code, never by request/repo content.

## X7 — secrets
**How to check:** grep the changed files for secret-pattern shapes (a
provider PAT, `AKIA…`, a `key`/`secret`/`token`/`password` assignment from a
literal or a request) and confirm any real secret flows only through
`LocalSecretsProvider` (`server/src/adapters/secrets/local.ts`) or
`AppConfig` (`server/src/platform/config.ts`) — never into a `runLog`/
`app.log` call, an HTTP response body, a URL, or an error message.
**Quote:** the logging/response call, and the secret's origin.
**False positives:** a variable named `token`/`key` holding a non-secret id
(a run id, a cache key).

## X8 — SQL
**How to check:** any `sql\`…\`` tagged template or `sql.raw(...)`. Confirm
request-derived text never reaches `sql.raw`; parameter interpolation goes
through Drizzle's tagged-template binding or the query builder, never string
concatenation.
**Quote:** the interpolated value's source; the raw SQL sink.
**False positives:** `sql.raw` built from a fixed, code-only fragment (e.g.
a column name chosen from a `switch` over a narrow enum).

## X9 — localhost exposure
**How to check:** `server/src/app.ts` and `server/src/server.ts` for the
bind host, CORS options, rate-limit registration, and whether any mutating
route accepts a non-object or `text/plain` body (which a plain HTML form
could send cross-origin, since CORS only blocks the browser from *reading*
the response, not from *sending* the request). Widening any of these —
broader CORS, `credentials: true` plus a permissive origin, rate limiting
dropped outside test, binding to a non-loopback host — is the finding.
Note for the report: this repo already binds `0.0.0.0`
(`server/src/server.ts:29`) with no Host-header allowlist; that is
*pre-existing*, report as informational (X9), never as a new CRITICAL,
unless a change makes it worse.
**Quote:** the config line changed.
**False positives:** a `config.nodeEnv !== 'test'` branch is intentional.

## X10 — dependencies
**How to check:** `git diff <base> -- '**/package.json'`; confirm the
matching lock file changed with it, from the right manager (`pnpm` for
`client/`/`server/`, `npm` for `reviewer-core/`/`e2e/`). Run `pnpm ls <pkg>`
or `npm ls <pkg>` **offline** to confirm the resolved version. The audit
itself (`pnpm audit` / `npm audit`) always calls the registry — list it
under *Checks not run*, not as a check you ran.
**Quote:** the changed dependency line(s).
**False positives:** a devDependency bump with no runtime reach.

## X11 — error/log leakage
**How to check:** every `catch` block touched by the change. It must fail
closed (return/throw an error response, never call `next()`/proceed as if
the request succeeded), and the logged or returned message must not include
a stack trace, a secret, or raw user input in a production code path.
**Quote:** the `catch` block.
**False positives:** a `catch` in test-only code, or a
`nodeEnv === 'development'` branch that is explicitly gated.
