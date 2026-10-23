# Evals backlog

Open follow-ups left after plans 31–33 (branch `L06_evals_coverage`, PR #22, 2026-10-11).
Nothing here is approved work: each item goes through the normal plan flow
(`implementation-planner` → user approval) before it is built. Evidence for every item
is in the cited plan's Verification log or in root `INSIGHTS.md`.

## 1. Isolation of agent eval sessions

- **Allowlist instead of denylist.** `agentTask` removes nine tools by name
  (`src/config.ts` `AGENT_DISALLOWED_TOOLS`), but the SDK has more built-ins that can run
  commands, reach the network or spawn agents (`Monitor` with `command`/`ws`, `REPL`,
  `Workflow`, `EnterWorktree`, `CronCreate`, `RemoteTrigger`). Pass the SDK base tool set
  (`Options.tools`, `sdk.d.ts:1358`) from `runClaude` for `agentTask`, plus
  `strictMcpConfig: true` so no `.mcp.json` / plugin MCP server loads. Unverified: prove it
  with a probe session that asks for `Monitor` and for an MCP tool, and keep the
  `git status --porcelain` before/after check. Source: plan 33 security review.
- **`workflowTask` and MCP.** It runs with `settingSources: ["project"]` in a worktree, so it
  may load the project `.mcp.json` (`devdigest`, whose `run_agent_on_pr` starts a paid
  review). Check, and pin `strictMcpConfig` if it does.
- **Per-agent tool policy.** The shared denylist removes `WebSearch`/`WebFetch`, which the
  `researcher` agent declares. A researcher eval would score the agent without its own
  tools; derive the allowed set from each agent's frontmatter instead.
- `src/artifacts/load.ts:43` `MUTATING_TOOLS` lacks `MultiEdit` (harmless today: the
  denylist covers it).

## 2. CI (`.github/workflows/harness-evals-*.yml`)

- **Test timeout for the tool tiers.** On DeepSeek V4 Flash via the LiteLLM proxy, agent cases
  hit vitest's 240 s `testTimeout` (`vitest.config.ts:9`); locally on Haiku they take ≤ 90 s.
  The deferred design: `EVAL_TEST_TIMEOUT_MS` in `src/config.ts` (default 240 000), 600 000 for
  the `agents` job only, eval step / job limits 45/55 min (agents) and 40/50 min (workflow).
  User deferred it on 2026-10-11.
- **Make evals blocking again** once the tool tiers are measured on the CI model
  (plan 31 D1 rev 2). A green job today only means the step ran; failures are `::warning`s.
- **Hardening:** pin actions by SHA; move `actions/*@v4` off Node 20 (deprecation warning on
  every run); bump the LiteLLM image digest by hand when needed (`proxy/docker-compose.yml`).
- `scripts/litellm-proxy.sh up` still prints a `google/gemini-2.5-flash` hint although CI uses
  DeepSeek — cosmetic.

## 3. What the evals found in the artifacts

Each needs a before/after series (`eval:repeat … --label before/after` → `eval:delta`), not a
single run.

- **onion-architecture case-3:** the `core/threshold.ts` `process.env` practice fails with and
  without the skill (0/5 both), and the HTTP-client practice scores lower with the skill
  (40 % vs 60 %). Fix the skill's MCP-core guidance or the case. See
  `docs/benchmarks/2026-10-11-onion-architecture.md`.
- **plan-verifier:** reports `complete` and counts Done-when commands as met when it could not
  run them (no Bash), and finds the defect without a `path:line`.
- **security-reviewer:** names the X4/X1 check only sometimes; its `devdigest-appsec` skill is
  not injected into the agent prompt (`agentContent()`, plan 32 D4 option B).
- **architecture-reviewer:** the out-of-scope security case dropped from PASS to 0.5 after the
  plan-33 tool change (n = 1). Re-baseline with `eval:repeat agents/architecture-reviewer -n 5`.
- **Workflow tier:** the `engineering-insights` positive activation fails (locally and on CI,
  where it also hits max turns 8); the server-routing case sometimes skips
  `server/insights/gotchas.md`.

## 4. Coverage not built yet

- Agent evals for `implementation-planner` (pass-1 format: TQ/GAP/REC, no code) and
  `spec-creator` (≤ 8 blocking questions, writes no file in pass 1).
- `zod` has 2 skill-creator cases under `.claude/skills/zod/evals/` that are not ported to
  `evals/`; `skill-evals/` (skill-creator iterations) and `evals/` are two systems — decide
  which one is canonical.
- New agent baseline: all four agent suites at n = 5 after the plan-33 tool change; the
  strict-v2 / lite-v2 series in `results-2026-10.md` predate it and are not comparable.

## 5. Tooling papercuts

- `eval:benchmark` writes its report only after all 2 × N runs and a background command dies at
  2 h, so a long benchmark is lost on a kill. Add a report-only mode (`--from-line`,
  `--drop-run`) instead of the scratch copy used in plan 32 (root `INSIGHTS.md`, 2026-10-11).
- `workflowTask`'s sandbox snapshot skips untracked files, so a new, uncommitted `AGENTS.md`
  is invisible to the workflow tier until it is committed.
- Fixture hygiene: `agents/architecture-reviewer/fixtures/checkout-service.diff` targets
  non-existent `server/src/modules/checkout/*` (does not `git apply --check`);
  `agents/security-reviewer/fixtures/repos-routes-rename.diff` has a hunk header 4 lines off.

## 6. Workflow tier: `server task follows the protocol…` is a known fail on local Haiku

- **Not a regression.** Local runs (`subscription`, `claude-haiku-4-5`) since 2026-10-12: ~1 real
  pass in ~30 (`results/records.jsonl`). The other "passes", including two on 2026-10-23
  (`fda3b034`, whose tree equals `80802f29`), read `server/insights/gotchas.md` under a guessed
  root (`/Users/<you>/projects/<memory-slug>/…`) that does not exist; the substring check counted
  it. Fixed: `workflowTask` keeps only reads of files that exist in the worktree
  (`readHits`, `src/runtime/sandbox.ts`); the rest go to the trace's `reads_missing`.
- **CI is green on it.** The workflow tier in CI runs `openrouter` + `deepseek/deepseek-v4-flash`
  (`.github/workflows/harness-evals-workflow.yml`), the reference model for this tier. On
  Haiku the session answers the read-only `server/` question from the code and skips the gotchas
  file; neither auto-memory off nor the read-only protocol sentence changed it (0/5 each).
- **Open, not approved:** a harness change that makes Haiku follow the protocol here (e.g. the
  "First step" line placement in `server/AGENTS.md`), measured with `eval:repeat -n 5`
  before/after; or run the local workflow tier on the CI model.
