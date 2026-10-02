# Demo: Blast Radius on a real repository

Goal: see at least 2 real callers and at least 1 HTTP endpoint in the Overview tab of a PR.

## 1. Start and index

1. `./scripts/dev.sh` (Postgres + API on :3001 + studio on :3000).
2. In the studio, import a GitHub repository you own.
3. Resync it: press the resync button, or `POST /repos/:id/resync`.
4. Wait until `GET /repos/:id/index-state` reports `status: "full"`.

Always resync right before the demo and wait for `index-state` to advance to the current
default-branch head. A stale index shows stale line numbers (during the first demo the index
was still at `c6af1e4`).

## 2. Prepare the PR

1. On a branch, edit one **exported helper** that at least 2 other files import.
2. Make sure at least one of those callers defines an HTTP route (for example an Express/Fastify handler).
3. Push the branch and open a PR on GitHub.
4. Pick a PR whose changed files have merged-PR history on the forge, so "Prior PRs" is not
   empty. Check on the default branch: `git log --oneline -- <file>` should show merge or
   squash commits with `(#N)`.

## 3. Check the studio

Open the PR in DevDigest, Overview tab. Expected:

- Summary row: at least 1 changed symbol, at least 2 callers, at least 1 endpoint.
- A collapsible tree per changed symbol with `file:line` links to the forge.
- Endpoints and crons listed separately.
- A Tree/Graph toggle; Graph shows the SVG map.
- "Prior PRs": merged PRs that touched the same files (GitHub only).
- Callers in test files (`*.test.*`, `*.it.test.*`, `test/`, `__tests__/`) are hidden (D11).
  Each call site is its own `file:line` row, and the callers count counts call sites (D12).

Server log shows one line per request served from the index:
`blast: read persistent repo index … no AST/import-graph rebuild`.

API check: `GET /pulls/:id/blast` (map) and `GET /pulls/:id/history` (prior PRs).

## Visual check

Compare the Overview tab with `docs/plans/assets/18-blast-radius/design-*.png`:

- [ ] Two columns at the top of the tab: Intent left, Blast radius right. The design's PR Brief
      card is intentionally absent (D9-B) and so are Risk areas (D10-A).
- [ ] Stat row with icons: symbols, callers, endpoints, crons.
- [ ] Segmented Tree/Graph toggle on the right of the stat row.
- [ ] Filled symbol rows `name()` with "N callers"; caller rows with `↳`.
- [ ] Blue endpoint chips (globe) and amber cron chips (clock).
- [ ] Graph: columns symbols | callers | endpoints with curved edges and a legend.
- [ ] "Prior PRs touching these files" panel inside the card, collapsible, with a count badge.

Log any mismatch in the plan's Verification log as `visual: <item>`.

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
