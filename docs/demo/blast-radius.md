# Demo: Blast Radius on a real repository

Goal: see at least 2 real callers and at least 1 HTTP endpoint in the Overview tab of a PR.

## 1. Start and index

1. `./scripts/dev.sh` (Postgres + API on :3001 + studio on :3000).
2. In the studio, import a GitHub repository you own.
3. Resync it: press the resync button, or `POST /repos/:id/resync`.
4. Wait until `GET /repos/:id/index-state` reports `status: "full"`.

## 2. Prepare the PR

1. On a branch, edit one **exported helper** that at least 2 other files import.
2. Make sure at least one of those callers defines an HTTP route (for example an Express/Fastify handler).
3. Push the branch and open a PR on GitHub.

## 3. Check the studio

Open the PR in DevDigest, Overview tab. Expected:

- Summary row: at least 1 changed symbol, at least 2 callers, at least 1 endpoint.
- A collapsible tree per changed symbol with `file:line` links to the forge.
- Endpoints and crons listed separately.
- A Tree/Graph toggle; Graph shows the SVG map.
- "Prior PRs": merged PRs that touched the same files (GitHub only).

Server log shows one line per request served from the index:
`blast: read persistent repo index … no AST/import-graph rebuild`.

API check: `GET /pulls/:id/blast` (map) and `GET /pulls/:id/history` (prior PRs).

## 4. MCP check

Call `get_blast_radius {repo: "owner/name", pr: <number>}`. It returns the same map as JSON
(strings capped at 200 chars). A degraded map carries a `hint`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `degraded: true`, `reason: "flag_off"` | The repo-intel feature flag is off; enable it and resync. |
| `reason: "no_data"` | No index yet, or no changed symbols resolved. Resync and wait for `full`. |
| `reason: "index_failed"` | The last index run failed; check the server log, then resync. |
| `reason: "index_partial"` / `"repo_too_large"` | Index is incomplete; callers listed are a lower bound. |
| `history.status: "unsupported"` | GitLab repositories have no prior-PR lookup. |
| `history.status: "unavailable"` | The forge call failed or timed out; reload to retry. |
