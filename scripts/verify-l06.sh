#!/usr/bin/env bash
#
# verify:l06 — hermetic check of the eval pipeline (spec 011, AC-62).
#
#   cd server && pnpm verify:l06
#
# No live LLM call, no API key: provider keys are unset and HOME is a temporary
# directory, so no real secrets store is read. The server tests run against
# scripted mock providers. The `.it` files need Docker (Postgres via testcontainers).
# The first failing check stops the script with a non-zero exit.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

TMP_HOME="$(mktemp -d)"
trap 'rm -rf "$TMP_HOME"' EXIT

unset OPENAI_API_KEY ANTHROPIC_API_KEY OPENROUTER_API_KEY GITHUB_TOKEN
export HOME="$TMP_HOME"
export TESTCONTAINERS_RYUK_DISABLED=true

step() { printf '\n== %s\n' "$1"; }

step "1/4 server: eval-pipeline tests (AC-62 #1-#5: unit, fixture >= 8 cases, integration)"
(cd "$ROOT/server" && pnpm exec vitest run test/eval-pipeline)

step "2/4 client: typecheck (AC-62 #6)"
(cd "$ROOT/client" && pnpm typecheck)

step "3/4 client: tests (AC-62 #6)"
(cd "$ROOT/client" && pnpm test)

step "4/4 contract: server and client copies are identical (AC-62 #7)"
cmp "$ROOT/server/src/vendor/shared/contracts/eval-pipeline.ts" \
    "$ROOT/client/src/vendor/shared/contracts/eval-pipeline.ts"

printf '\nverify:l06: all checks passed\n'
