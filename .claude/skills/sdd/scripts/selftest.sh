#!/usr/bin/env bash
# selftest.sh - exercises every sdd.sh subcommand in a throwaway git repo.
# Never touches the repo it lives in. Last line "selftest: ok", exit 0.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDD="${here}/sdd.sh"
work="$(mktemp -d "${TMPDIR:-/tmp}/sdd-selftest.XXXXXX")"
trap 'rm -rf "${work}"' EXIT
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE

ok() { echo "ok $1"; }
fail() { echo "FAIL $1"; exit 1; }
eq() { # name expected actual
  if [ "$2" = "$3" ]; then ok "$1"; else echo "--- expected"; printf '%s\n' "$2"; echo "--- actual"; printf '%s\n' "$3"; fail "$1"; fi
}
sdd() { bash "${SDD}" "$@"; }
rc_of() { local rc=0; "$@" >/dev/null 2>&1 || rc=$?; echo "${rc}"; }
state_of() { sdd state "$1" | head -1; }

mkdir -p "${work}/repo"
cd "${work}/repo"
git init -q .
# safety: every git command below must hit the throwaway repo, never the real one
[ "$(cd "${work}/repo" && pwd -P)" = "$(git rev-parse --show-toplevel)" ] || fail "throwaway repo guard"
git config user.email t@t
git config user.name t
mkdir -p docs/plans specs

write_plan() { # path status [spec]
  cat > "$1" <<PLAN
# Development Plan: x
Status: $2
Execution: single-agent
Spec: ${3:-none}

## Goal
brief text

<!-- implementer-brief:end -->

## Design notes
notes

## Verification log
- 2026-01-01 first
PLAN
}
write_plan docs/plans/01-x.md draft
cat > docs/plans/README.md <<'FIX'
# plans
| Plan | Status | Spec |
|---|---|---|
| [01-x](01-x.md) | draft (decisions) | none |
FIX
cat > specs/001-x.md <<'FIX'
# Spec: x
Spec ID: SPEC-01
Status: draft

## Open questions
Empty.
FIX
cat > specs/002-legacy.md <<'FIX'
---
status: draft
packages: server
---

# 002 legacy
FIX
cat > specs/README.md <<'FIX'
# specs
| Spec | Status | Packages |
|------|--------|----------|
| [001 — X](001-x.md) | draft | server |
| [002 — Legacy](002-legacy.md) | draft | server |
FIX
git add -A && git commit -q -m fixtures

# --- set-status
sdd set-status plan docs/plans/01-x.md approved >/dev/null
eq "set-status plan file" "Status: approved" "$(sed -n 2p docs/plans/01-x.md)"
eq "set-status plan index" "| [01-x](01-x.md) | approved | none |" "$(sed -n 4p docs/plans/README.md)"
sdd set-status plan docs/plans/01-x.md "draft (decisions)" >/dev/null
eq "set-status plan draft (decisions) file" "Status: draft" "$(sed -n 2p docs/plans/01-x.md)"
eq "set-status plan draft (decisions) index" "| [01-x](01-x.md) | draft (decisions) | none |" "$(sed -n 4p docs/plans/README.md)"
sdd set-status spec specs/001-x.md approved >/dev/null
eq "set-status spec file" "Status: approved" "$(sed -n 3p specs/001-x.md)"
eq "set-status spec index" "| [001 — X](001-x.md) | approved | server |" "$(sed -n 4p specs/README.md)"
sdd set-status spec specs/002-legacy.md approved >/dev/null
eq "set-status legacy file" "status: active" "$(sed -n 2p specs/002-legacy.md)"
eq "set-status legacy index" "| [002 — Legacy](002-legacy.md) | active | server |" "$(sed -n 5p specs/README.md)"
before="$(cat docs/plans/01-x.md docs/plans/README.md)"
eq "set-status unknown value exits 2" "2" "$(rc_of bash "${SDD}" set-status plan docs/plans/01-x.md bogus)"
eq "set-status unknown value leaves files" "${before}" "$(cat docs/plans/01-x.md docs/plans/README.md)"
sdd set-status plan docs/plans/01-x.md draft >/dev/null
git add -A && git commit -q -m statuses

# --- handoff / log / follow-up
printf 'did a thing\nsecond line\n' | sdd handoff docs/plans/01-x.md G1 - >/dev/null
sdd follow-up docs/plans/01-x.md "later item" >/dev/null
sdd log docs/plans/01-x.md "it-suite: green" >/dev/null
d="$(date +%F)"
expected="# Development Plan: x
Status: draft
Execution: single-agent
Spec: none

## Goal
brief text

<!-- implementer-brief:end -->

## Design notes
notes

## Handoffs → G1

did a thing
second line

## Follow-ups
- ${d} later item

## Verification log
- 2026-01-01 first
- ${d} it-suite: green"
eq "handoff, follow-up, log order" "${expected}" "$(cat docs/plans/01-x.md)"
sdd follow-up docs/plans/01-x.md "second item" >/dev/null
eq "follow-up appends to existing section" "- ${d} later item
- ${d} second item" "$(grep -A1 'later item' docs/plans/01-x.md)"
eq "handoff twice exits 2" "2" "$(rc_of bash "${SDD}" handoff docs/plans/01-x.md G1 /dev/null)"
printf '# p\n\n<!-- implementer-brief:end -->\n\nbody\n' > docs/plans/02-bare.md
sdd log docs/plans/02-bare.md "created" >/dev/null
sdd follow-up docs/plans/02-bare.md "fu" >/dev/null
eq "missing sections are created" "# p

<!-- implementer-brief:end -->

body

## Follow-ups
- ${d} fu

## Verification log
- ${d} created" "$(cat docs/plans/02-bare.md)"
printf '# p\n' > docs/plans/03-nomarker.md
eq "handoff without marker exits 2" "2" "$(rc_of bash "${SDD}" handoff docs/plans/03-nomarker.md G1 /dev/null)"
rm docs/plans/02-bare.md docs/plans/03-nomarker.md

# --- handback-check
printf '## Steps\n| Step / gap | Status | Files changed |\n' > "${work}/good.txt"
eq "handback-check passes a step table" "0" "$(rc_of bash "${SDD}" handback-check "${work}/good.txt")"
printf 'placeholder' > "${work}/bad.txt"
eq "handback-check fails placeholder" "1" "$(rc_of bash "${SDD}" handback-check "${work}/bad.txt")"
eq "handback-check message" "hand-back without a step table: treat as unknown" "$(printf 'placeholder' | bash "${SDD}" handback-check - || true)"

# --- porcelain
git add -A && git commit -q -m edits
sdd porcelain save "${work}/porc.txt"
eq "porcelain check passes when unchanged" "0" "$(rc_of bash "${SDD}" porcelain check "${work}/porc.txt")"
echo new > newfile.txt
eq "porcelain check fails after a new file" "1" "$(rc_of bash "${SDD}" porcelain check "${work}/porc.txt")"

# --- checkpoint
sum_before="$(shasum .git/index)"; por_before="$(git status --porcelain)"
tree="$(sdd checkpoint 01 wave-1)"
eq "checkpoint leaves .git/index" "${sum_before}" "$(shasum .git/index)"
eq "checkpoint leaves git status --porcelain" "${por_before}" "$(git status --porcelain)"
eq "checkpoint ref is a tree" "tree" "$(git cat-file -t refs/sdd/01/wave-1)"
eq "checkpoint ref equals printed sha" "${tree}" "$(git rev-parse refs/sdd/01/wave-1)"
eq "checkpoint tree contains the untracked file" "newfile.txt" "$(git ls-tree --name-only "${tree}" | grep -x newfile.txt)"
git gc -q --prune=now
eq "checkpoint tree survives gc" "tree" "$(git cat-file -t "${tree}")"
eq "checkpoint rejects a bad label" "2" "$(rc_of bash "${SDD}" checkpoint 01 'bad label')"

# --- delta
echo more > another.txt
eq "delta lists a new untracked file" "A	another.txt" "$(sdd delta "${tree}")"
eq "delta between identical trees is empty" "" "$(sdd delta "${tree}" "${tree}")"

# --- brief-diff
git add -A && git commit -q -m more
base="$(sdd checkpoint 01 plan-approved)"
sdd set-status plan docs/plans/01-x.md in-progress >/dev/null
eq "brief-diff identical after a Status change" "0" "$(rc_of bash "${SDD}" brief-diff docs/plans/01-x.md "${base}")"
awk '{ print } /^brief text$/ { print "edited" }' docs/plans/01-x.md > "${work}/p.md"
cat "${work}/p.md" > docs/plans/01-x.md
eq "brief-diff differs after a brief edit" "1" "$(rc_of bash "${SDD}" brief-diff docs/plans/01-x.md "${base}")"
eq "brief-diff prints the change" "> edited" "$(bash "${SDD}" brief-diff docs/plans/01-x.md "${base}" | grep '^>' || true)"

# --- state (files rewritten per case; the fixture spec is approved first)
rm docs/plans/01-x.md
sdd set-status spec specs/001-x.md draft >/dev/null
eq "state spec draft" "stage: spec-approve" "$(state_of specs/001-x.md)"
sdd set-status spec specs/001-x.md approved >/dev/null
eq "state spec approved without plan" "stage: research" "$(state_of specs/001-x.md)"
write_plan docs/plans/01-x.md draft specs/001-x.md
printf '\nSteps: pending decisions\n' >> docs/plans/01-x.md
eq "state plan pending decisions" "stage: plan-decisions" "$(state_of docs/plans/01-x.md)"
eq "state spec finds its plan" "stage: plan-decisions" "$(state_of specs/001-x.md)"
write_plan docs/plans/01-x.md approved specs/001-x.md
eq "state plan approved" "stage: implement" "$(state_of docs/plans/01-x.md)"
write_plan docs/plans/01-x.md in-progress specs/001-x.md
printf 'h\n' | sdd handoff docs/plans/01-x.md all - >/dev/null
eq "state plan in-progress with one handoff" "stage: it-suite" "$(state_of docs/plans/01-x.md)"
sdd log docs/plans/01-x.md "review iteration 1: fix 2, tree abc" >/dev/null
eq "state review iteration with fix items" "stage: fix-loop" "$(state_of docs/plans/01-x.md)"
sdd log docs/plans/01-x.md "plan-verifier: complete" >/dev/null
eq "state after plan-verifier" "stage: sign-off" "$(state_of docs/plans/01-x.md)"
eq "state prints a because line" "because:" "$(sdd state docs/plans/01-x.md | sed -n 2p | cut -c1-8)"

echo "selftest: ok"
