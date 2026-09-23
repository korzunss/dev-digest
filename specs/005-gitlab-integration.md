---
status: active
packages: server, client
---

# 005 — GitLab integration

## Problem

DevDigest speaks GitHub and only GitHub. The repo URL parser hardcodes
`github.com`, the only forge adapter is `OctokitGitHubClient`, the DI container
exposes a single `container.github()`, and the client builds `github.com`
deep-links from `repo.full_name`. A team on GitLab (gitlab.com or self-managed)
cannot import a project, cannot list merge requests, and cannot post a review
comment.

Nothing about the review engine is GitHub-specific — `reviewer-core` sees a
diff and returns findings. The coupling is entirely in the adapter layer and in
the three modules that call it (`repos`, `pulls`, `polling`) plus `settings`.

## Scope

- A provider-agnostic **`ForgeClient`** port (rename of `GitHubClient`), with two
  implementations: the existing Octokit one and a new GitLab REST one.
- `repos.provider` + `repos.api_base` columns; every forge call resolves its client
  from the repo row, so one workspace can hold GitHub **and** GitLab repos.
- URL parsing that recognises both forges, including **self-managed** GitLab
  instances (the target deployment — including a relative-URL/subpath install)
  and nested groups (`group/subgroup/project`).
- `GITLAB_TOKEN` as a first-class secret: API Keys row, `secrets-status` badge,
  `test-connection` branch, and authenticated clone.
- Merge requests surfaced through the existing PR list/detail endpoints; MR
  discussions surfaced through the existing inline-comment endpoints.
- Client deep-links, provider badge, and the "View on …" affordance.

**Not in scope.** Webhooks (polling stays manual, as it is for GitHub) ·
GitLab OAuth (PAT only, mirroring the GitHub PAT model) · GitLab CI artifact
ingestion for `ci_runs` · posting an approval/`REQUEST_CHANGES` review (see
*Approvals* under Design — the port method stays, the semantics degrade) ·
Bitbucket or any third forge, though the port is shaped so one can be added.

## Design

### 1. The port: `GitHubClient` → `ForgeClient`

`server/src/vendor/shared/adapters.ts` owns the interface. Rename it in place
and keep the method set — the shape already fits GitLab, because it was written
against *our* DTOs (`PrMeta`, `PrDetail`, `PrReviewComment`), not against
Octokit's payloads. Four changes to the shape:

```ts
export type ForgeProvider = 'github' | 'gitlab';

export interface RepoRef {
  owner: string;          // everything before the last '/' (a GitLab group path may contain '/')
  name: string;
  /** Full project path, e.g. "acme/payments-api" or "acme/backend/payments-api". */
  path?: string;
  provider?: ForgeProvider;
  /**
   * Origin + any path prefix of a self-managed instance
   * (`https://git.acme.com` or `https://acme.com/gitlab`); undefined ⇒ the
   * provider default. Not a bare host — see §10.1.
   */
  apiBase?: string;
}

export interface ForgeClient {
  readonly provider: ForgeProvider;
  // … existing methods, unchanged signatures
}
```

`ForgeProvider` must **not** be called `Provider` — `contracts/knowledge.ts`
already exports `Provider` for LLM providers, and both are re-exported from
`@devdigest/shared`.

Add a one-line back-compat alias `export type GitHubClient = ForgeClient;` only
if the rename lands in two commits; otherwise do the rename clean — there are
exactly **6** `container.github()` call sites and **4** `GitHubClient` type
annotations in `src/`.

### 2. Container

Replace the single getter with a resolver keyed by provider+base:

```ts
async forge(ref: { provider?: ForgeProvider; apiBase?: string }): Promise<ForgeClient>
```

- cache key `${provider}:${apiBase ?? default}`;
- `github` → `GITHUB_TOKEN` → `OctokitGitHubClient` (unchanged);
- `gitlab` → `GITLAB_TOKEN` (per-instance override first, §10.4) →
  `GitLabRestClient(token, apiBase)`;
- missing token → `ConfigError`, exactly as today, so every existing
  "serve persisted data offline" `try/catch` keeps working untouched.

`ContainerOverrides.github?: GitHubClient` becomes
`forge?: ForgeClient | Partial<Record<ForgeProvider, ForgeClient>>`. Accepting
both keeps the ~10 test files to a single mechanical rename
(`github: new MockGitHubClient()` → `forge: new MockForgeClient()`).

`invalidateSecretCaches()` must clear the whole forge cache, not one field.

### 3. Data model

`server/src/db/schema/repos.ts`:

```ts
provider: text('provider', { enum: ['github', 'gitlab'] }).notNull().default('github'),
apiBase: text('api_base'),       // null ⇒ provider default; see §10.1
projectPath: text('project_path'), // full path incl. nested groups; null ⇒ fullName
```

- `text(..., { enum })` emits **no** SQL constraint (see `server/INSIGHTS.md`) —
  the enum is TypeScript-only, so keep the row→DTO mapper total
  (`row.provider as ForgeProvider`), never an exhaustive switch that throws.
- The unique index widens: `repos_ws_fullname_uq` → `(workspace_id, provider,
  full_name)`. `acme/api` can legitimately exist on both forges.
- This migration only **adds** columns and swaps an index, so `pnpm db:generate`
  will not hit the rename-detection prompt that hangs the generator when one
  table both drops and adds a column.

`pull_requests` needs **no** schema change: GitLab's `iid` (project-scoped,
the number in the MR URL) maps onto `number`, and the
`(repo_id, number)` unique index still holds. Use `iid`, never `id`.

DTO: `Repo` gains `provider` and `api_base` (both in `contracts/platform.ts`). Any
test fixture factory of the form `(o: Partial<Repo>) => ({...defaults, ...o})`
must get the new keys in its **defaults** literal, or the change surfaces as a
misleading `TS2719` in an unrelated test file (root `INSIGHTS.md`).

### 4. URL parsing and clone auth

`modules/repos/helpers.ts` today: `GITHUB_URL_REGEX` + `withGitHubToken`, both
hardcoding `github.com`. Replace with:

```ts
parseRepoUrl(url, explicit?: ForgeProvider):
  { provider, apiBase, owner, name, fullName }
```

- origin from the URL (https, or the `git@host:path` / `ssh://git@host:2222/path`
  forms — a non-default SSH port must survive parsing), path = everything after
  it,
  minus a trailing `.git`;
- `owner` = path minus its last segment, `name` = last segment. A nested GitLab
  group therefore lands in `owner` as `acme/backend` — which is what
  `clonePathFor` (`join(cloneDir, owner, name)`) and the `mkdir(…, {recursive:true})`
  in `SimpleGitClient.clone` already handle. **Reject any segment equal to `..`**
  before it reaches `join` — today the two-segment GitHub regex made that
  impossible, and widening it removes the accidental guard;
- provider inference: `github.com` → github, `gitlab.com` → gitlab, anything
  else → **only** what the `GITLAB_HOST` allowlist says. `RepoInput.provider`
  exists but is a *disambiguator among trusted hosts*, never an authoriser:
  an unlisted host is rejected whether or not a provider is named, and a
  provider contradicting a known host is a 400 rather than a silent
  preference. Anything looser hands the forge PAT to a host the request picks
  — it travels as a `PRIVATE-TOKEN` header to `${origin}/api/v4` and is
  embedded in the clone URL by `withForgeToken`. Non-http(s) schemes are
  rejected too: `z.string().url()` accepts `file:`/`ftp:`, whose `origin` is
  the string `'null'`.

`withGitHubToken` → `withForgeToken(url, token, provider)`: the embedded
username differs — GitHub wants `x-access-token`, GitLab wants `oauth2`. Match
on *the URL's own host*, not a constant, so self-managed clones authenticate.

`RepoService.refresh()` currently rebuilds the clone URL as
`https://github.com/${repo.fullName}.git` — that literal must come from
`repo.provider` + `repo.apiBase` instead. It is the one place a GitLab repo would
silently re-clone from GitHub.

### 5. The GitLab adapter

`server/src/adapters/gitlab/rest.ts`, sibling to `adapters/github/octokit.ts`
(the adapter layout is flat per-port; no `adapters/forge/**` regrouping).

**Transport: raw `fetch`**, not `@gitbeaker/rest`. GitLab's REST surface here is
~10 endpoints, auth is one header, pagination is one header — the SDK's weight
buys nothing, and a thin `request()` keeps the adapter readable next to Octokit.

One non-obvious requirement: `platform/resilience.ts`'s `defaultIsRetryable`
inspects `err.status` / `err.statusCode` / `err.response.status`. `fetch` does
**not** throw on 4xx/5xx, so the `request()` helper must throw an Error object
carrying `status` — otherwise every call is wrapped in `withRetry` and silently
never retries a 429 or a 502. Keep the same `TIMEOUT = 30_000` and the same
`withRetry(() => withTimeout(…))` nesting as the Octokit client.

Project id in every path is `encodeURIComponent(projectPath)`.

| Port method | GitLab REST |
|---|---|
| `listPullRequests` | `GET /projects/:id/merge_requests?scope=all&state=all&order_by=updated_at&per_page=50` |
| `getPullRequest` | `GET …/merge_requests/:iid` (+ `diff_refs`) + `…/changes` (files+patches) + `…/commits` |
| `listReviewComments` | `GET …/merge_requests/:iid/discussions` → flatten notes where `type === 'DiffNote'` |
| `createReviewComment` | new thread: `POST …/discussions` with a `position` object · reply: `POST …/discussions/:discussion_id/notes` |
| `openPullRequest` | `POST /projects/:id/merge_requests` (`source_branch`/`target_branch`/`title`/`description`) |
| `findOpenPr` | `GET /projects/:id/merge_requests?state=opened&source_branch=…` |
| `commitFiles` | `POST /projects/:id/repository/commits` — one call, `actions[]`, `start_branch` |
| `getIssue` | `GET /projects/:id/issues/:iid` |
| `currentLogin` | `GET /user` → `username` |
| `postReview` | note via `POST …/notes`, then `POST …/approve` when `event === 'APPROVE'` |

**Status mapping.** GitLab `state` is `opened | closed | merged | locked`;
`merged` wins, `locked` maps to `open`. `merged_at` is not needed — unlike
GitHub, the state is authoritative.

**Diff stats.** `GET …/merge_requests/:iid` exposes `changes_count` as a
*string*, not an integer — GitLab caps it at 1,000 and then returns the
literal `"1000+"`. Do not `Number()` it blindly —
derive `files_count` from `changes.length` and `additions`/`deletions` by
summing the parsed diffs, so the list's S/M/L sizing stays honest. The
backfill loop in `pulls/routes.ts` already exists for exactly this gap.

**Commit author.** `commit.author_name`, with no login fallback — GitLab's
commit payload has no `author.login` equivalent.

**Inline comments — the sharp edge.** GitHub anchors a comment with
`commit_id + path + line`. GitLab needs a `position`:

```json
{ "base_sha": …, "start_sha": …, "head_sha": …,
  "old_path": …, "new_path": …, "position_type": "text",
  "new_line": 42 }
```

The three shas are already on the single-MR payload as
`diff_refs: { base_sha, start_sha, head_sha }` ("the `diff_refs` in the response
correspond to the latest diff version"), so `createReviewComment` needs one
`GET …/merge_requests/:iid` — **not** the `…/versions` endpoint. `pr.headSha`
alone, which the route passes today as `commitId`, is not sufficient: `base_sha`
and `start_sha` have no GitHub counterpart and cannot be derived locally.

Replies are addressed by **discussion id — a 40-char string**, while
`PrReviewComment.id` and `PrCommentInput.in_reply_to` are `z.number().int()`.
Contract change, in `contracts/platform.ts` and its client mirror:

- `PrReviewComment` gains `thread_id: z.string().nullish()` (GitHub leaves it
  null; GitLab fills it with the discussion id);
- `PrCommentInput.in_reply_to` widens to
  `z.union([z.number().int(), z.string()])`;
- `CreateReviewCommentInput.inReplyTo` widens to `number | string`.

`is_outdated` maps from the note's `position.new_line == null` (or a
`resolved`/outdated version marker), mirroring GitHub's `line == null` rule so
the client's `OutdatedComments` footer needs no change.

**`commitFiles` create-vs-update.** GitLab rejects `action: 'create'` for an
existing file and `action: 'update'` for a missing one. Probe once with
`GET /projects/:id/repository/tree?path=…&ref=<branch|base>` and pick per file;
do not guess. (No `src/` call site today — `commitFiles` is used only by the
not-yet-wired CI publishing path — so this can ship as the simple version with
a `// TODO` as long as the behaviour is documented.)

### 6. Module wiring

Mechanical, once the container resolves by repo row:

- `modules/polling/routes.ts:28` — `container.github()` → `container.forge(repo)`.
- `modules/pulls/routes.ts` — 4 sites, same swap. The two comment routes also
  pass `thread_id`/string `in_reply_to` through.
- `modules/repos/service.ts` — token secret and clone URL derive from
  `repo.provider`; `GITHUB_TOKEN_SECRET` constant becomes a
  `TOKEN_SECRET_BY_PROVIDER` map.
- `modules/settings/` — `SECRET_KEY_BY_PROVIDER` gains
  `gitlab: 'GITLAB_TOKEN'`; the `provider === GITHUB_PROVIDER` branch in
  `test-connection` becomes `provider === 'github' || provider === 'gitlab'`,
  both resolving through `container.forge()` and calling `currentLogin()`.
- `ConnTestProvider` and `SecretsStatus` gain `gitlab`. `SecretsStatus` is a
  closed `z.object` — adding the key is a breaking response-shape change that
  the client's `secrets-status` consumer must get in the same change.

`RepoRef` is constructed ad hoc at every call site as
`{ owner: repo.owner, name: repo.name }`. Add a
`toRepoRef(row)` helper in `modules/repos/helpers.ts` and use it everywhere, so
`provider`/`apiBase`/`path` cannot be forgotten at one of the seven sites.

### 7. Client

- `src/lib/github-urls.ts` → `src/lib/forge-urls.ts`, dispatching on
  `repo.provider` and `repo.api_base`:
  - GitHub: `/{full}/pull/{n}` · `/{full}/blob/{sha}/{path}#L10-L20`
  - GitLab: `/{full}/-/merge_requests/{iid}` · `/{full}/-/blob/{sha}/{path}#L10-20`
    — note the `-/` infix and that GitLab's range anchor is `#L10-20`, **not**
    `#L10-L20`.
- `PrDetailHeader` — "View on GitHub" becomes a provider-parameterised label;
  new i18n keys in `messages/en/prReview.json` (the string is hardcoded in the
  component today, unlike its neighbours).
- `AddRepoView` — placeholder/hint mention both forges; provider picker shown
  only for an unrecognised host.
- `SettingsApiKeys/constants.ts` — a `gitlab` row + `apiKeys.gitlabLabel` /
  `apiKeys.gitlabHint` in `messages/en/settings.json` (scopes: `api`, or
  `read_api` + `write_repository` for a read-mostly setup).
- A small provider badge on the repo card / PR list header, so a mixed
  workspace is readable.
- `client/src/vendor/shared` — mirror **only** the touched fields by hand
  (`ForgeProvider`, `Repo.provider/api_base`, `ConnTestProvider`, `SecretsStatus`,
  `PrReviewComment.thread_id`, `PrCommentInput.in_reply_to`,
  `RepoInput.provider`). The two vendored copies are already divergent by
  design; `cp -r` over them drags server-only contracts into the client (root
  `INSIGHTS.md`). Verify with a `diff` scoped to those field names only.

### 8. Tests

| File | Tier | Covers |
|---|---|---|
| `server/test/repo-url.test.ts` | unit | provider inference, nested groups, ssh form **with a non-default port**, subpath install (`https://acme.com/gitlab/group/proj`) → `apiBase` + project path split correctly, `..` rejection, `withForgeToken` username per provider |
| `server/test/gitlab-adapter.test.ts` | unit (stub `fetch`) | MR→`PrMeta`, discussions→`PrReviewComment`, `position` assembly from `diff_refs`, `changes_count: "1000+"`, a 429 carrying `status` actually retrying |
| `server/test/gitlab.it.test.ts` | integration | add a `gitlab.com` URL → row has `provider='gitlab'`; `/repos/:id/pulls` routes through the GitLab mock; posting a comment reaches `createReviewComment` with a `thread_id` reply |
| `e2e/specs/11-gitlab-repo.flow.json` | e2e | import → MR list → MR detail, deterministic |

`MockGitHubClient` → `MockForgeClient` with a `provider` option. Its
`listPullRequests()` returns **one** hard-coded PR (#482) unless `opts.pulls` is
passed — any test that needs a second MR must insert it itself
(`server/INSIGHTS.md`). Keep that behaviour rather than "fixing" it; several
existing tests depend on the single-PR shape.

The `.it.test.ts` suffix is what the CI split greps on — a DB-backed GitLab test
misnamed `gitlab.test.ts` runs in the unit lane and fails on a missing Postgres.

### 9. Minimum GitLab version

The plan above was written against the current REST API v4 docs. The oldest
instance we have been asked to support is **14.5.2** (Dec 2021), so every
endpoint was re-checked against `gitlab-foss@v14.5.2/doc/api/`. Result: the
design works on 14.5.2 **unchanged**, with two caveats.

| Thing we rely on | 14.5.2 | Note |
|---|---|---|
| `GET …/merge_requests` + `scope=all`, `state`, `order_by=updated_at`, `source_branch` | yes | — |
| `state`: `opened` / `closed` / `locked` / `merged` | yes | same four values as today |
| `GET …/merge_requests/:iid` incl. `diff_refs{base_sha,start_sha,head_sha}` | yes | this is what makes the `position` object buildable |
| `GET …/merge_requests/:iid/changes` | yes | **the only option** here — see caveat 1 |
| `GET …/merge_requests/:iid/diffs` | **no** | the 15.7 replacement; paginated, unlike `/changes` |
| `changes_count` capped to the string `"1000+"` | yes | documented in 14.5 already |
| `GET/POST …/merge_requests/:iid/discussions` with the full `position[…]` set, incl. `line_range` | yes | multi-line notes included |
| `POST …/discussions/:discussion_id/notes` (replies) | yes | discussion `id` is a string; notes carry `"type": "DiffNote"` |
| `POST /projects/:id/repository/commits` with `actions[]` (`create`/`update`/`delete`/`move`/`chmod`) + `start_branch` | yes | — |
| `PRIVATE-TOKEN` header · `Authorization: Bearer` · pagination `x-next-page`/`x-total-pages` · `per_page` default 20 / max 100 | yes | — |
| `POST …/merge_requests/:iid/approve` | **Premium only** | "Moved to GitLab Premium in 13.9" |

**Caveat 1 — diff retrieval is the one method that genuinely differs.**
Everything else in the port maps to an endpoint that behaves identically on
14.5.2 and on current GitLab. Diffs do not:

| | 14.5.2 | current |
|---|---|---|
| endpoint | `…/:iid/changes` (only option) | `…/:iid/diffs` (`/changes` deprecated 15.7, removal in API v5) |
| pagination | none — one response, silently truncated on huge MRs | `page`/`per_page` (capped at 30 originally, now 100) |
| format | per-file `diff` strings | same, plus `unidiff=true` for unified format |

So the seam is **not** a path literal — it is a whole method with a different
pagination contract. Isolate it as one private `fetchDiffs(projectPath, iid)`
that returns our `PrFile[]`, with two implementations picked once from the
version probe (§10.5): loop pages on ≥15.7, single call below. Every other
method stays version-agnostic. Getting this wrong on a modern instance means
silently reviewing only the first 30 files of a large MR — a correctness bug
that looks like a model failure, not an API one.

**Caveat 1b — two fields to not reach for.** `merged_by` and `merge_status` are
both deprecated (removal in API v5) in favour of `merge_user` and
`detailed_merge_status`. Neither is needed here — `status` maps from `state` —
but `merge_status` is the obvious-looking field for "can this merge", so it is
worth naming as off-limits before someone reaches for it.

**Caveat 2 — `approve` is Premium on 14.x.** The `approve`/`unapprove`
endpoints were moved to Premium in 13.9 and only returned to Free later, so on a
14.5.2 **CE/Free** instance `postReview` with `event: 'APPROVE'` gets a 403/404.
Post the summary note first and treat the approve call as best-effort: swallow
403/404 and report "commented, not approved" rather than failing the whole
review. This is not hypothetical for the tier this instance is likely on.

**Security note, not a blocker.** 14.5.2 is long past end-of-life and carries
known CVEs. Nothing in this plan depends on staying there — it is called out so
the choice is deliberate rather than inherited.

**Unverified.** The GitLab side of this was checked against docs, not against a
live 14.5.2 instance. The two things docs cannot settle are the exact error body
shape on a rejected `position` (needed for the 400→`AppError` mapping in
`POST /pulls/:id/comments`) and whether nested-group path encoding behaves
identically on that build. Both fall out of the first manual smoke test.

### 10. Self-managed GitLab

The target instance is **self-hosted**, not gitlab.com. That is the primary
case, not an edge case, and it changes five things.

**10.1 — The API base is a URL, not a host.** GitLab can be installed under a
relative URL (`external_url "https://example.com/gitlab"`), in which case the
REST API is **not** at the host root. This is why §3 stores `repos.api_base`
rather than a bare host: it is the full origin **plus** any path prefix, and
every request is built as `${apiBase}/api/v4/…`. Same for the client: `forge-urls.ts`
must compose from that base, or every "View on GitLab" link 404s on a
subpath install. Derive the base from the URL the user pasted when adding the
repo (everything before the project path); do not hardcode `/api/v4` onto the
bare host. **Verify on the actual instance** — whether the prefix applies to
`/api/v4` is a property of that deployment, and the Omnibus docs do not spell
it out.

**10.2 — TLS: an internal CA will break `fetch` and `git` separately.** A
private/self-signed certificate is the single most likely first failure, and it
fails in two places that are configured differently:

- Node (`fetch`, and Octokit) → `NODE_EXTRA_CA_CERTS=/path/to/ca.pem`, read
  **only at process start**;
- `git clone`/`fetch` in `SimpleGitClient` → `GIT_SSL_CAINFO`, a *separate*
  variable that `NODE_EXTRA_CA_CERTS` does not cover.

Document both in `server/.env.example` next to the existing
`GIT_TERMINAL_PROMPT` handling. Never reach for `NODE_TLS_REJECT_UNAUTHORIZED=0`
or `http.sslVerify=false` — they disable verification process-wide, including
for the LLM provider calls.

**10.3 — Corporate proxy: Node 22's `fetch` silently ignores `HTTP_PROXY`.**
This is the non-obvious one. `undici` (Node's global `fetch`) does **not** read
`HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` by default, so behind an egress proxy the
GitLab adapter times out while `git clone` — which honours the same variables
natively — succeeds. The symptom reads as "the API is down" while the clone
works. Two fixes, pick by deployment Node version:

- Node ≥ 24 (the dev box is on 26): `NODE_USE_ENV_PROXY=1`, zero dependencies;
- Node 22: add `undici` as a direct dependency and
  `setGlobalDispatcher(new EnvHttpProxyAgent())` once at boot in
  `platform/`, before any adapter is constructed.

Note this affects the **existing** OpenAI/Anthropic/Octokit adapters too — it is
pre-existing latent behaviour that a self-managed rollout is simply the first
thing to expose.

**10.4 — Tokens are per instance, not per provider.** `GITLAB_TOKEN` as a single
secret assumes one GitLab. A workspace pointing at two self-managed instances
needs two PATs. Key the secret by base: look up `GITLAB_TOKEN@<api_base_host>`
first and fall back to plain `GITLAB_TOKEN`, mirroring how
`LocalSecretsProvider` already falls back `GITHUB_TOKEN` → `GITHUB_PAT`. The
API Keys UI stays a single row until a second instance actually exists.

Provider inference (§4) also simplifies: for an unrecognised host the answer is
no longer "guess" — the Add-repo form asks, and `RepoInput.provider` carries it.
`GITLAB_HOST` as an env allowlist becomes a convenience for the common
single-instance case, not the mechanism.

**10.5 — Version and tier are unknown at build time, so probe them.** A
self-managed instance drifts; §9's matrix is only useful if the app knows which
side of it the instance is on. `GET ${apiBase}/api/v4/version` returns
`{ version, revision }` and is available on every version in scope. Extend
`test-connection` for `gitlab` to report it: *"Connected as @user · GitLab
14.5.2"*. That one line turns every later "why doesn't X work" into a lookup
instead of an investigation.

Tier is **not** probeable — `/license` is admin-only — which is why §9's
`approve` handling must be a swallowed 403/404 rather than a capability check.

**10.6 — Egress for the LLM, not just for GitLab.** If DevDigest runs inside the
network that hosts GitLab, reaching it is easy and reaching
OpenAI/Anthropic/OpenRouter may be blocked. `reviewer-core` cannot review
without a model. This is an operational precondition, not a code change, but it
belongs on the rollout checklist ahead of anything in this spec: confirm
outbound access, or plan a self-hosted model behind the OpenAI-compatible
`OpenAIProvider` (which accepts a custom base URL) before the first review.

**New env, all optional** (`server/.env.example`):

```
GITLAB_TOKEN=                  # PAT, scope: api  (or read_api + write_repository)
GITLAB_HOST=                   # comma-separated hosts treated as GitLab
NODE_EXTRA_CA_CERTS=           # internal CA for Node (fetch / Octokit)
GIT_SSL_CAINFO=                # internal CA for git clone/fetch — separate knob
NODE_USE_ENV_PROXY=            # 1 on Node >= 24, behind an egress proxy
```

## Phasing

| # | Phase | Deliverable | Reviewable alone |
|---|---|---|---|
| 0 | Contracts | `ForgeProvider`, `ForgeClient` rename, `Repo`/`PrReviewComment`/`PrCommentInput`/`RepoInput` fields, mirrored into the client copy | yes — typecheck both packages |
| 1 | Schema | `repos.provider/api_base/project_path`, widened unique index, one generated migration | yes |
| 2 | Container + port rename | `container.forge(ref)`, overrides, mock rename, all 6 call sites | yes — full suite green, behaviour identical |
| 3 | GitLab adapter | `adapters/gitlab/rest.ts` + unit tests, nothing wired | yes |
| 4 | Wiring | URL parser, clone auth, repos/pulls/polling/settings | yes — GitLab works end-to-end on the API |
| 5 | Client | forge-urls, labels, API-keys row, provider picker + badge | yes |
| 6 | Tests + docs | integration, e2e flow 11, `README.md`/`AGENTS.md` updates | yes |

Phases 0–2 change **no** behaviour; they are the safe half and should land
first, separately, so phase 3's diff is purely additive.

## Acceptance

1. A `https://gitlab.com/<group>/<project>` URL added via Add Repo creates a row
   with `provider='gitlab'`, and the clone job authenticates with
   `oauth2:<GITLAB_TOKEN>` and succeeds against a **private** project.
2. A `https://gitlab.com/<group>/<sub>/<project>` (nested group) URL imports, and
   the clone lands at `<cloneDir>/<group>/<sub>/<project>`.
3. `GET /repos/:id/pulls` on a GitLab repo returns MRs with real `additions` /
   `deletions` / `files_count` (not zeroes after the backfill pass), correct
   `status` for an open, a merged and a closed MR, and `number` equal to the MR
   **iid** shown in the GitLab URL.
4. `GET /pulls/:id` returns files with patches, commits, and a linked issue when
   the description says `Closes #N`.
5. `GET /pulls/:id/comments` returns existing MR diff discussions; a comment
   posted through `POST /pulls/:id/comments` appears on the MR in GitLab on the
   right file and line, and a reply posted with that comment's `thread_id` lands
   in the same discussion thread.
6. A GitLab repo with no `GITLAB_TOKEN` configured still renders its persisted
   PR list and detail — the offline degradation path is unchanged.
7. Settings → API Keys shows a GitLab row; `test-connection` with a valid PAT
   returns `Connected as @<username>`, and `secrets-status` reports
   `gitlab: true`.
8. A workspace holding one GitHub **and** one GitLab repo lists both, and each
   PR's "View on …" opens the correct host and the correct URL shape
   (`/pull/N` vs `/-/merge_requests/N`).
9. Every existing GitHub test passes unchanged in behaviour after the rename —
   `pnpm test` in `server/`, `pnpm test` in `client/`.
10. On a **GitLab 14.5.2** instance: acceptance 1–8 hold, and `postReview` with
    `event: 'APPROVE'` against a Free/CE instance posts the note and reports
    "commented, not approved" instead of throwing.
11. A self-managed host listed in `GITLAB_HOST` imports without an explicit
    provider on the request. An unlisted host is rejected with
    `unknown_forge_host` **even when `provider` is supplied**, and a provider
    contradicting a known host is rejected with `provider_mismatch`.
12. A project on a **subpath install** (`https://acme.com/gitlab/group/proj`)
    imports, its MRs list, and the client's "View on GitLab" link resolves to
    `https://acme.com/gitlab/group/proj/-/merge_requests/N` — i.e. the prefix
    survives both the API base and the deep-link builder.
13. With the instance behind an internal CA, setting `NODE_EXTRA_CA_CERTS` makes
    the API calls succeed and setting `GIT_SSL_CAINFO` makes the clone succeed —
    verified as two independent steps, with
    `NODE_TLS_REJECT_UNAUTHORIZED` left alone.
14. `test-connection` for `gitlab` reports the instance version, e.g.
    *"Connected as @user · GitLab 14.5.2"*.

## Implementation delta

Built as specified except for the following, each decided while implementing:

- **`repos.project_path` was not added.** `full_name` already IS the project
  path for both forges, nested GitLab groups included, so the column would have
  been dead on arrival. The §3 note anticipated this.
- **The unique key includes the instance, via `coalesce(api_base, '')`** —
  `repos_ws_forge_fullname_uq`, not the `(workspace, provider, full_name)` in
  §3. Found by an integration test: `team/api` on two different self-managed
  GitLabs deduplicated into one repo. `coalesce` is load-bearing, because
  Postgres treats NULLs as distinct in a unique index and a bare `api_base`
  column would have stopped deduplicating every *hosted* repo.
- **`GitHubReviewPayload` keeps its name.** `reviewer-core` resolves the
  server's `shared` through a tsconfig alias with no vendored copy of its own,
  so renaming it would pull a third package into an adapter-local change.
  Documented at the declaration; follow-up.
- **`commitFiles` ships complete**, not as the §5 "simple version with a TODO":
  per-file `create` vs `update` is chosen by probing the target ref.
- **`ssh://` URLs drop their port.** An SSH port says nothing about where the
  HTTPS API lives, and keeping it made the host miss both the configured-base
  prefix match and the public-host table. A port on an `https://` URL is kept.
- **The `..` guard only fires on the configured-base branch.** Everywhere else
  `new URL` collapses `..` before the guard can see it, so the input resolves to
  a different well-formed project rather than escaping. Asserted in
  `server/test/repo-url.test.ts` so a parser rewrite that stops normalising
  fails loudly.
- **e2e coverage is narrower than §8 implied.** `11-gitlab-affordances.flow.json`
  covers the API Keys row and the add-repo copy — everything reachable
  key-free. Importing a real GitLab project, listing MRs and posting a
  discussion need a reachable instance and a PAT, so they are covered by
  `server/test/gitlab.it.test.ts` and `server/test/gitlab-adapter.test.ts`
  instead. **No test in this change has talked to a real GitLab.**

## Open questions

- **Approvals.** GitLab has approve/unapprove but no `REQUEST_CHANGES`. If
  `postReview` ever gets a call site, does `REQUEST_CHANGES` become
  "unapprove + note", or does it stay unsupported and throw? Note the tier
  split in §9: on 14.x both endpoints are Premium, so the Free-tier answer may
  have to be "note only" regardless.
- **Self-managed discovery.** Is an env allowlist (`GITLAB_HOST`) the right
  home, or should the forge base be a per-workspace setting so it is
  configurable from the UI without a restart? §10.4 leans the second way the
  moment a second instance appears.
- **`repos.project_path` vs `full_name`.** They are identical for every case
  we have; the column exists only so a future rename-tolerant id (GitLab's
  numeric project id) has somewhere to live. Drop it if that never materialises.
