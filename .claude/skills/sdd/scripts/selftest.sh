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

# ---- plan-23 guards: a second throwaway repo, same toplevel guard
new_repo() { # name -> cd into a fresh throwaway repo
  mkdir -p "${work}/$1"
  cd "${work}/$1"
  git init -q .
  [ "$(cd "${work}/$1" && pwd -P)" = "$(git rev-parse --show-toplevel)" ] || fail "throwaway repo guard ($1)"
  git config user.email t@t
  git config user.name t
  mkdir -p docs/plans specs
}
new_repo repo2

# --- plan-lint
cat > docs/plans/10-lint.md <<'LINT'
# Development Plan: lint
Status: draft

### S1 - count
- **Done when:** `grep -c foo x.txt` prints 1

### S2 - phrase
- **Done when:** `grep -q 'two words' docs/a.md` rc 0

### S3 - phrase joined
- **Done when:** `tr '\n' ' ' < docs/a.md | grep -q 'two words'` rc 0

### S4 - one token
- **Done when:** `grep -n 'heredoc' docs/a.md` shows a line

<!-- implementer-brief:end -->
LINT
lint_out="$(bash "${SDD}" plan-lint docs/plans/10-lint.md || true)"
eq "plan-lint exits 1 on findings" "1" "$(rc_of bash "${SDD}" plan-lint docs/plans/10-lint.md)"
eq "plan-lint findings name their step" "plan-lint: S1: grep -c
plan-lint: S2: multi-word grep on a .md file" "${lint_out}"
cat > docs/plans/11-clean.md <<'LINT'
# Development Plan: clean

### S1 - joined
- **Done when:** `tr '\n' ' ' < docs/a.md | grep -q 'two words'` rc 0

<!-- implementer-brief:end -->
LINT
eq "plan-lint clean plan" "plan-lint: ok" "$(sdd plan-lint docs/plans/11-clean.md)"
eq "plan-lint missing file exits 2" "2" "$(rc_of bash "${SDD}" plan-lint docs/plans/nope.md)"
printf '# no marker\n' > docs/plans/12-nomarker.md
eq "plan-lint missing marker exits 2" "2" "$(rc_of bash "${SDD}" plan-lint docs/plans/12-nomarker.md)"
rm docs/plans/1[0-2]-*.md

# --- status-check
write_plan docs/plans/01-x.md draft
cat > docs/plans/README.md <<'FIX'
# plans
| Plan | Status | Spec |
|---|---|---|
| [01-x](01-x.md) | draft | none |
FIX
eq "status-check consistent" "status-check: ok" "$(sdd status-check)"
write_plan docs/plans/01-x.md approved
eq "status-check exits 1 on a manual status edit" "1" "$(rc_of bash "${SDD}" status-check)"
eq "status-check names the file" "status-check: docs/plans/01-x.md file=approved index=draft" "$(bash "${SDD}" status-check || true)"
write_plan docs/plans/01-x.md draft
printf '\nSteps: pending decisions\n' >> docs/plans/01-x.md
eq "status-check wants draft (decisions) for pending decisions" "1" "$(rc_of bash "${SDD}" status-check)"
sdd set-status plan docs/plans/01-x.md "draft (decisions)" >/dev/null
eq "status-check ok with draft (decisions)" "status-check: ok" "$(sdd status-check)"
printf '# Spec\nStatus: approved\n' > specs/001-s.md
printf '# specs\n| Spec | Status |\n|---|---|\n| [001](001-s.md) | draft |\n' > specs/README.md
eq "status-check flags a spec row" "status-check: specs/001-s.md file=approved index=draft" "$(bash "${SDD}" status-check || true)"
rm -f specs/001-s.md specs/README.md
git add -A && git commit -q -m fixtures2

# --- git-state / porcelain with the state block
sdd git-state save "${work}/gs.txt"
eq "git-state check unchanged" "0" "$(rc_of bash "${SDD}" git-state check "${work}/gs.txt")"
sdd porcelain save "${work}/pc.txt"
git commit -q --allow-empty -m empty
eq "git-state check fails after a commit" "1" "$(rc_of bash "${SDD}" git-state check "${work}/gs.txt")"
eq "porcelain check fails after a commit that leaves the tree clean" "1" "$(rc_of bash "${SDD}" porcelain check "${work}/pc.txt")"
sdd git-state save "${work}/gs.txt"
sdd checkpoint 01 gs-ref >/dev/null
eq "git-state ignores refs/sdd/" "0" "$(rc_of bash "${SDD}" git-state check "${work}/gs.txt")"

# --- handback-check --log
write_plan docs/plans/05-hb.md in-progress
printf 'placeholder' > "${work}/ph.txt"
eq "handback-check --log still fails" "1" "$(rc_of bash "${SDD}" handback-check --log docs/plans/05-hb.md G1 "${work}/ph.txt")"
eq "handback-check --log appends the line" "- ${d} handback: unknown G1" "$(tail -1 docs/plans/05-hb.md)"
eq "handback-check --log not written on success" "0" "$(rc_of bash "${SDD}" handback-check --log docs/plans/05-hb.md G2 "${work}/good.txt")"
eq "handback-check --log success leaves the plan" "- ${d} handback: unknown G1" "$(tail -1 docs/plans/05-hb.md)"

# --- agent / agent-flush / stages
sdd agent docs/plans/05-hb.md plan-p1 a1b2 implementation-planner
agent_line="$(tail -1 docs/plans/05-hb.md)"
agent_ok=no
if [[ "${agent_line}" =~ ^-\ ${d}\ agent:\ plan-p1\ a1b2\ implementation-planner\ [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then agent_ok=yes; fi
eq "agent line format" "yes" "${agent_ok}"
eq "agent unknown stage exits 2" "2" "$(rc_of bash "${SDD}" agent docs/plans/05-hb.md nope a1 spec-creator)"
eq "agent bad id exits 2" "2" "$(rc_of bash "${SDD}" agent docs/plans/05-hb.md plan-p1 'a b' spec-creator)"
eq "agent bad type exits 2" "2" "$(rc_of bash "${SDD}" agent docs/plans/05-hb.md plan-p1 a1 Spec_Creator)"
sdd agent - spec-p1 c3 spec-creator
sdd agent - research d4 researcher
eq "agent - writes the pending log" "2" "$(wc -l < .sdd/pending-agents.log | tr -d ' ')"
sdd agent-flush docs/plans/05-hb.md
eq "agent-flush removes the pending log" "no" "$([ -f .sdd/pending-agents.log ] && echo yes || echo no)"
eq "agent-flush keeps the order, last in the log" "agent: spec-p1 c3 spec-creator
agent: research d4 researcher" "$(tail -2 docs/plans/05-hb.md | sed -E 's/^- [0-9-]+ //; s/ [0-9T:-]+Z$//')"
eq "agent-flush without a pending file is a no-op" "0" "$(rc_of bash "${SDD}" agent-flush docs/plans/05-hb.md)"
eq "stages lists metrics before handover" "self-review
metrics
handover" "$(sdd stages | tail -3)"

# --- state skips bookkeeping lines; metrics stage
write_plan docs/plans/06-st.md in-progress
printf 'h\n' | sdd handoff docs/plans/06-st.md G1 - >/dev/null
sdd log docs/plans/06-st.md "plan-verifier: complete" >/dev/null
sdd agent docs/plans/06-st.md review a9 plan-verifier
sdd log docs/plans/06-st.md "handback: unknown G2" >/dev/null
sdd log docs/plans/06-st.md "resume: review" >/dev/null
sdd log docs/plans/06-st.md "plan-lint: fail 1" >/dev/null
sdd log docs/plans/06-st.md "status-check: fail 1" >/dev/null
eq "state skips agent/handback/resume/lint lines" "stage: sign-off" "$(state_of docs/plans/06-st.md)"
write_plan docs/plans/06-st.md done
sdd log docs/plans/06-st.md "self-review: clean" >/dev/null
eq "state done after self-review is metrics" "stage: metrics" "$(state_of docs/plans/06-st.md)"
sdd log docs/plans/06-st.md "metrics: flags: 0 flag(s), 0 repeat(s)" >/dev/null
eq "state done after metrics is handover" "stage: handover" "$(state_of docs/plans/06-st.md)"

# --- scripts lint
for f in "${here}"/*.sh "${here}"/../../*/scripts/*.sh; do
  eq "script shebang $(basename "${f}")" "#!/usr/bin/env bash" "$(head -1 "${f}")"
  eq "script has no var-colon form $(basename "${f}")" "1" "$(rc_of grep -Eq '\$[A-Za-z_][A-Za-z0-9_]*:' "${f}")"
done

# --- usage-scan (fixture transcripts only, never ~/.claude)
write_plan docs/plans/07-ua.md in-progress
sdd log docs/plans/07-ua.md "agent: plan-p1 a1 implementation-planner 2026-01-01T10:00:00Z" >/dev/null
sdd log docs/plans/07-ua.md "agent: plan-p2 a1 implementation-planner 2026-01-01T11:00:00Z" >/dev/null
txd="${work}/tx/sess1/subagents"
mkdir -p "${txd}/workflows"
a1="${txd}/agent-a1.jsonl"
printf '%s\n' '{"timestamp":"2026-01-01T09:58:00Z","message":{"id":"m1","model":"mx","usage":{"input_tokens":5,"output_tokens":1,"cache_read_input_tokens":10,"cache_creation_input_tokens":2}}}' > "${a1}"
printf '%s\n' '{"timestamp":"2026-01-01T09:59:00Z","message":{"id":"m1","model":"mx","usage":{"input_tokens":10,"output_tokens":2,"cache_read_input_tokens":20,"cache_creation_input_tokens":4}}}' >> "${a1}"
printf '%s\n' '{"timestamp":"2026-01-01T10:30:00Z","message":{"id":"m2","model":"mx","content":"SECRET_CONTENT","usage":{"input_tokens":100,"output_tokens":20,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}' >> "${a1}"
printf '%s\n' '{"timestamp":"2026-01-01T11:30:00Z","message":{"id":"m3","model":"mx","usage":{"input_tokens":1000,"output_tokens":200,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}' >> "${a1}"
printf '%s\n' 'not json {' >> "${a1}"
printf '%s\n' '{"timestamp":"2026-01-01T11:31:00Z","message":{"id":"m9"}}' >> "${a1}"
printf '%s\n' '{"timestamp":"2026-01-01T09:00:00Z","message":{"id":"b1","model":"mx","usage":{"input_tokens":7,"output_tokens":3,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}' > "${txd}/agent-a2.jsonl"
printf '%s\n' '{"agentType":"explorer","description":"SECRET_CONTENT"}' > "${txd}/agent-a2.meta.json"
printf '%s\n' '{"timestamp":"2026-01-01T09:00:00Z","message":{"id":"c1","model":"mx","usage":{"input_tokens":1,"output_tokens":1}}}' > "${txd}/agent-a4.jsonl"
printf '%s\n' '{broken' > "${txd}/agent-a4.meta.json"
printf '%s\n' '{"timestamp":"2026-01-01T09:00:00Z","message":{"id":"d1","model":"mx","usage":{"input_tokens":1,"output_tokens":1}}}' > "${txd}/agent-a5.jsonl"
: > "${txd}/agent-a3.jsonl"
printf '%s\n' '{"timestamp":"2026-01-01T09:00:00Z","message":{"id":"w1","model":"mx","usage":{"input_tokens":1,"output_tokens":1}}}' > "${txd}/workflows/agent-x.jsonl"
export SDD_TRANSCRIPTS_DIR="${work}/tx"
ua_out="$(sdd usage-scan)"
eq "usage-scan summary" "usage-scan: 5 agents, 5 rows, 3 unmatched, 2 skipped lines" "${ua_out}"
ua_type() { node -e '
const rows = require("fs").readFileSync(".sdd/usage.jsonl", "utf8").split("\n").filter(Boolean).map(JSON.parse);
console.log(rows.filter((x) => x.agent_id === process.argv[1]).map((x) => String(x.agent_type)).join(","));
' "$1"; }
eq "usage-scan type from agent line wins" "implementation-planner,implementation-planner" "$(ua_type a1)"
eq "usage-scan type from sibling meta" "explorer" "$(ua_type a2)"
eq "usage-scan broken meta gives null" "null" "$(ua_type a4)"
eq "usage-scan missing meta gives null" "null" "$(ua_type a5)"
ua_q() { node -e '
const rows = require("fs").readFileSync(".sdd/usage.jsonl", "utf8").split("\n").filter(Boolean).map(JSON.parse);
const [a, p] = process.argv.slice(1);
const r = rows.filter((x) => x.agent_id === a && String(x.plan) === p);
console.log(r.length + " " + r.map((x) => x.input + "/" + x.output + "/" + x.cache_read + "/" + x.cache_creation + "/" + x.messages).join(","));
' "$1" "$2"; }
eq "usage-scan a1 counts m1 once (last line wins), m2+m3 in plan-p2" "2 10/2/20/4/1,1100/220/0/0/2" "$(ua_q a1 07)"
ua_stage() { node -e '
const rows = require("fs").readFileSync(".sdd/usage.jsonl", "utf8").split("\n").filter(Boolean).map(JSON.parse);
console.log(rows.filter((x) => x.agent_id === "a1").map((x) => x.stage + ":" + x.messages + ":" + x.input).sort().join(","));
'; }
eq "usage-scan a1 split per stage" "plan-p1:1:10,plan-p2:2:1100" "$(ua_stage)"
eq "usage-scan a2 has plan null" "1 7/3/0/0/1" "$(ua_q a2 null)"
eq "usage-scan no a3 or x row" "0" "$(grep -c '"agent_id":"a3"\|"agent_id":"x"' .sdd/usage.jsonl || true)"
eq "usage-scan stores no content" "1" "$(rc_of grep -q SECRET_CONTENT .sdd/usage.jsonl)"
cp .sdd/usage.jsonl "${work}/usage.first"
sdd usage-scan >/dev/null
eq "usage-scan re-run leaves the file identical" "0" "$(rc_of cmp "${work}/usage.first" .sdd/usage.jsonl)"
eq "usage-scan bad args exit 2" "2" "$(rc_of sdd usage-scan --bogus x)"
eq "usage-scan missing dir" "usage-scan: no transcripts" "$(SDD_TRANSCRIPTS_DIR="${work}/none" sdd usage-scan)"
eq "usage-scan missing dir rc 0" "0" "$(SDD_TRANSCRIPTS_DIR="${work}/none" rc_of sdd usage-scan)"
unset SDD_TRANSCRIPTS_DIR

# --- flags (fixture usage rows only)
new_repo repo3
fx_row() { # plan stage input output cache_read cache_creation
  printf '{"session_id":"s","agent_id":"a%s","agent_type":"implementer","plan":"%s","stage":"%s","model":"mx","input":%s,"output":%s,"cache_read":%s,"cache_creation":%s,"messages":1,"first_ts":null,"last_ts":null}\n' "$1" "$1" "$2" "$3" "$4" "$5" "$6" >> .sdd/usage.jsonl
}
write_plan docs/plans/01-a.md done
write_plan docs/plans/02-b.md done
write_plan docs/plans/03-c.md done
write_plan docs/plans/04-d.md done
write_plan docs/plans/05-e.md done
sdd log docs/plans/02-b.md "review iteration 3" >/dev/null
sdd log docs/plans/04-d.md "review iteration 3" >/dev/null
sdd log docs/plans/04-d.md "handback: unknown G1" >/dev/null
sdd log docs/plans/04-d.md "resume: implement" >/dev/null
sdd log docs/plans/04-d.md "plan-lint: fail 1" >/dev/null
eq "flags no usage file" "flags: no usage data" "$(sdd flags docs/plans/04-d.md | head -1)"
eq "flags no usage file rc 0" "0" "$(rc_of sdd flags docs/plans/04-d.md)"
mkdir -p .sdd
: > .sdd/usage.jsonl
# weighted metric: plan 02 is the median and exercises every weight:
# 5*10000 output + 0.1*400000 cache_read + 1.25*8000 cache_creation = 100000 (raw sum 418000);
# any other weighting moves the median away from 100000
fx_row 01 plan-p1 5000 0 0 0
fx_row 02 plan-p1 0 10000 400000 8000
fx_row 03 plan-p1 150000 0 0 0
fx_row 04 plan-p1 300000 0 0 0
fx_out="$(sdd flags docs/plans/04-d.md)"
eq "flags F1 uses weighted tokens (cache reads discounted)" "flag: F1 plan=04 stage=plan-p1 weighted_tokens=input+1.25*cache_creation+0.1*cache_read+5*output 300000 median=100000 over 3 plans" "$(printf '%s\n' "${fx_out}" | sed -n 1p)"
eq "flags F2 F3 F5 raised" "F2,F3,F5" "$(printf '%s\n' "${fx_out}" | sed -n 's/^flag: \(F[235]\) .*/\1/p' | paste -sd, -)"
eq "flags F4 counts resume" "flag: F4 plan=04 resume x1 multi_agent_stage_weighted_tokens=0" "$(printf '%s\n' "${fx_out}" | grep '^flag: F4')"
eq "flags repeat F2 across plans" "repeat: F2 plans=02,04" "$(printf '%s\n' "${fx_out}" | grep '^repeat: F2')"
eq "flags summary" "flags: 5 flag(s), 1 repeat(s)" "$(printf '%s\n' "${fx_out}" | tail -1)"
eq "flags prose-only plan raises nothing" "flags: 0 flag(s), 0 repeat(s)" "$(sdd flags docs/plans/05-e.md)"
eq "flags bad args exit 2" "2" "$(rc_of sdd flags)"
# only two other plans have rows -> F1 is not evaluated
: > .sdd/usage.jsonl
fx_row 01 plan-p1 100000 0 0 0
fx_row 02 plan-p1 100000 0 0 0
fx_row 03 plan-p1 900000 0 0 0
fx_out="$(sdd flags docs/plans/03-c.md)"
eq "flags F1 needs 3 other plans" "flags: 0 flag(s), 0 repeat(s)" "${fx_out}"

echo "selftest: ok"
