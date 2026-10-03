# @devdigest/mcp-server

A local stdio MCP server for Claude Code: a thin client over the DevDigest API.
It holds no state and needs no credentials; the API does the work.

## Setup

```sh
cd mcp-server && pnpm install
./scripts/dev.sh            # from the repo root: the API must be running
```

The repo's `.mcp.json` registers it as `devdigest`; run `claude mcp list` to check.
Read tools are auto-approved and `run_agent_on_pr` asks first
(`.claude/settings.json`).

## Tools

| Tool | Args | Returns |
|---|---|---|
| `list_agents` | — | all agents with an `enabled` flag, short descriptions |
| `run_agent_on_pr` | `repo`, `pr`, `agent` | triggers one run, waits up to 45 s: `done` + concise review, or `running` + `run_id` |
| `get_findings` | `repo`, `pr`, `agent?`, `run_id?`, `min_severity?` | `{verdict, findings[]}` per agent, ≤20 by severity + `total` |
| `get_conventions` | `repo` | accepted conventions + `pending_count` |
| `get_blast_radius` | `repo`, `pr` | changed symbols, callers (`file:line`), endpoints and crons from the repo index; `degraded` + `hint` when the index is missing (impact UNKNOWN) |

`repo` is `owner/name` or `name`; `pr` is the PR number.

## Design principles

Result, not operation (one call yields a review) · flat primitive args · concise
output (capped, truncated, no suggestion bodies) · errors that name the next step ·
minimal startup footprint (≤6,000 chars).

## Environment

| Variable | Default |
|---|---|
| `DEVDIGEST_API_URL` | `http://127.0.0.1:3001` |
| `DEVDIGEST_MCP_WAIT_MS` | `45000` |
| `DEVDIGEST_MCP_POLL_MS` | `2000` (min 100) |

Invalid values log to stderr and exit 1.

## Development

`pnpm typecheck` · `pnpm test` · `pnpm inspect` (MCP Inspector over stdio).
Layout and rules: [`AGENTS.md`](AGENTS.md).
