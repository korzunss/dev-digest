#!/usr/bin/env bash
# sdd.sh - the one entry point for the main session's edits and git checkpoints
# of the /sdd pipeline. Run from anywhere inside the repo; it cd's to the root.
# BSD/macOS safe: no in-place sed, no GNU-only flags. Never touches the real index.
set -euo pipefail

MARKER='<!-- implementer-brief:end -->'
LOG_HEAD='## Verification log'
FU_HEAD='## Follow-ups'
# stage ids of SKILL.md section 2, in order
STAGES="intake spec-p1 spec-answers spec-p2 spec-approve research plan-p1 plan-decisions ext-research plan-p2 plan-approve implement tests it-suite review fix-loop sign-off close docs insights self-review metrics handover"

die() { echo "sdd: $*" >&2; exit 2; }

usage() {
  cat <<'USAGE'
sdd.sh <subcommand> [args]
  set-status <plan|spec> <path> <status>   rewrite Status: line and index row cell
  handoff <plan> <label> [file|-]          append "## Handoffs -> <label>" below the brief marker
  log <plan> <text>                        append "- <date> <text>" to ## Verification log
  follow-up <plan> <text>                  append "- <date> <text>" to ## Follow-ups
  handback-check [--log <plan> <label>] [file|-]  exit 0 when the report has the step table; --log records "handback: unknown <label>" on failure
  porcelain save <file> | check <file>     snapshot / compare `git status --porcelain` plus the git-state block
  git-state save <file> | check <file>     snapshot / compare HEAD, refs (minus refs/sdd/) and the stash list
  plan-lint <plan>                         flag grep -c and multi-word .md greps in Done-when lines
  status-check                             compare plan/spec Status: lines with their README index rows
  agent <plan|-> <stage> <agentId> <agentType>  log "agent: ..." (- = .sdd/pending-agents.log until the plan exists)
  agent-flush <plan>                       move .sdd/pending-agents.log into the plan's Verification log
  usage-scan [--session <id>]              sum subagent transcript usage into .sdd/usage.jsonl (no content read)
  flags <plan>                             no-LLM threshold flags F1-F5 and repeat: lines (reads .sdd/usage.jsonl)
  cost <plan>                              per-stage tokens, cache hit, busy time, parallelism, unattributed rows (reads .sdd/usage.jsonl)
  stages                                   print the stage ids, one per line
  checkpoint <NN> <label>                  pin the work tree as refs/sdd/<NN>/<label> (temp index)
  delta <treeA> [treeB]                    name-status diff between two trees (B defaults to now)
  brief-diff <plan> <tree>                 plan text above the marker vs <tree> (ignores Status:/Execution:)
  state <spec|plan path>                   print "stage: <id>" and one "because:" line
  help                                     this text
USAGE
}

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not inside a git repository"
cd "${root}"

# ---- helpers -------------------------------------------------------------

tmp_beside() { mktemp "$(dirname "$1")/.sdd.XXXXXX"; }

# overwrite $2 with the content of $1 (keeps the mode of $2), drop $1
replace_file() { cat "$1" > "$2"; rm -f "$1"; }

read_input() { # file or - (stdin) -> stdout
  if [ "${1:-}" = "-" ] || [ -z "${1:-}" ]; then cat; else [ -f "$1" ] || die "no such file: $1"; cat "$1"; fi
}

need_file() { [ -f "$1" ] || die "no such file: $1"; }

# path-argument guards: run before need_file, every rejection exits 2 via die
bad_path() { # empty, absolute, leading -, or any .. segment
  case "$1" in ''|/*|-*|..|../*|*/..|*/../*) return 0 ;; esac
  return 1
}

need_plan_path() { # docs/plans/<NN>-<name>.md, no further /
  bad_path "$1" && die "bad plan path: $1"
  case "$1" in
    docs/plans/[0-9]*-*.md) ;;
    *) die "plan path must be docs/plans/NN-name.md: $1" ;;
  esac
  case "${1#docs/plans/}" in */*) die "plan path must be docs/plans/NN-name.md: $1" ;; esac
}

need_spec_path() { # specs/<file>.md or <pkg>/specs/<file>.md
  bad_path "$1" && die "bad spec path: $1"
  case "$1" in
    specs/*.md) case "${1#specs/}" in */*) die "spec path must be specs/<file>.md: $1" ;; esac ;;
    */specs/*.md)
      case "${1%%/specs/*}" in */*) die "spec path must be <pkg>/specs/<file>.md: $1" ;; esac
      case "${1#*/specs/}" in */*) die "spec path must be <pkg>/specs/<file>.md: $1" ;; esac ;;
    *) die "spec path must be specs/<file>.md or <pkg>/specs/<file>.md: $1" ;;
  esac
}

need_tree() { # a git ref that resolves to a tree
  case "${1:-}" in ''|-*) die "bad tree/ref argument: ${1:-}" ;; esac
  git rev-parse --verify --quiet "$1^{tree}" >/dev/null || die "not a tree: $1"
}

need_marker() { grep -qxF "${MARKER}" "$1" || die "no '${MARKER}' line in $1"; }

# append "$3" as the last line of section "$2" in file "$1"; create the section
# when missing (before the Verification log when $4=1, else at the end)
append_line() {
  local file="$1" head="$2" line="$3" before="$4" tmp
  tmp="$(tmp_beside "${file}")"
  HEAD="${head}" LINE="${line}" BEFORE="${before}" awk '
    { lines[NR] = $0 }
    END {
      h = ENVIRON["HEAD"]; l = ENVIRON["LINE"]; mk = ENVIRON["BEFORE"]
      s = 0
      for (i = 1; i <= NR; i++) if (lines[i] == h) { s = i; break }
      if (s) {
        e = NR
        for (i = s + 1; i <= NR; i++) if (lines[i] ~ /^## /) { e = i - 1; break }
        while (e > s && lines[e] ~ /^[ \t]*$/) e--
        for (i = 1; i <= e; i++) print lines[i]
        print l
        for (i = e + 1; i <= NR; i++) print lines[i]
      } else {
        at = NR + 1
        if (mk == "1") for (i = 1; i <= NR; i++) if (lines[i] == "## Verification log") { at = i; break }
        for (i = 1; i < at; i++) print lines[i]
        if (at > 1 && lines[at - 1] !~ /^[ \t]*$/) print ""
        print h
        print l
        if (at <= NR) print ""
        for (i = at; i <= NR; i++) print lines[i]
      }
    }' "${file}" > "${tmp}" || { rm -f "${tmp}"; die "edit failed"; }
  replace_file "${tmp}" "${file}"
}

make_tree() { # $1 = pin ref or empty; prints the tree sha, never touches .git/index
  local dir idx tree
  dir="$(mktemp -d "${TMPDIR:-/tmp}/sdd-idx.XXXXXX")"
  trap "rm -rf '${dir}'" EXIT INT TERM
  case "${dir}/" in "${root}/"*) rm -rf "${dir}"; die "TMPDIR is inside the work tree" ;; esac
  idx="${dir}/index"
  tree="$(GIT_INDEX_FILE="${idx}" git add -A >/dev/null 2>&1 && GIT_INDEX_FILE="${idx}" git write-tree)" \
    || { rm -rf "${dir}"; die "could not write tree"; }
  rm -rf "${dir}"
  if [ -n "${1:-}" ]; then git update-ref "$1" "${tree}"; fi
  printf '%s\n' "${tree}"
}

file_status_key_value() { # prints "<key>|<value>" of the first Status line (Status: or status:)
  awk 'index($0,"Status:")==1 { sub(/^Status:[ \t]*/, ""); print "Status:|" $0; exit }
       index($0,"status:")==1 { sub(/^status:[ \t]*/, ""); print "status:|" $0; exit }' "$1"
}

# ---- subcommands ---------------------------------------------------------

cmd_set_status() {
  [ $# -eq 3 ] || die "usage: set-status <plan|spec> <path> <status>"
  local kind="$1" file="$2" status="$3" index key fval ival base legacy=0
  case "${kind}" in
    plan) need_plan_path "${file}" ;;
    spec) need_spec_path "${file}" ;;
  esac
  need_file "${file}"
  base="$(basename "${file}")"
  case "${kind}" in
    plan)
      case "${status}" in
        draft|approved|in-progress|done|abandoned) fval="${status}"; ival="${status}" ;;
        "draft (decisions)") fval="draft"; ival="draft (decisions)" ;;
        *) die "unknown plan status: ${status}" ;;
      esac
      index="docs/plans/README.md"; key="Status:"
      grep -q '^Status:' "${file}" || die "no Status: line in ${file}"
      ;;
    spec)
      index="$(dirname "${file}")/README.md"
      if grep -q '^status:' "${file}" && ! grep -q '^Status:' "${file}"; then legacy=1; fi
      case "${status}" in
        draft) fval="draft"; ival="draft" ;;
        approved) if [ "${legacy}" = 1 ]; then fval="active"; else fval="approved"; fi; ival="${fval}" ;;
        implemented) if [ "${legacy}" = 1 ]; then fval="done"; else fval="implemented"; fi; ival="${fval}" ;;
        *) die "unknown spec status: ${status}" ;;
      esac
      if [ "${legacy}" = 1 ]; then key="status:"; else key="Status:"; fi
      grep -q "^${key}" "${file}" || die "no ${key} line in ${file}"
      ;;
    *) die "first argument must be plan or spec" ;;
  esac
  need_file "${index}"
  BASE="${base}" awk 'index($0, "(" ENVIRON["BASE"] ")") && $0 ~ /^\|/ { f = 1 } END { exit !f }' "${index}" \
    || die "no index row for ${base} in ${index}"
  local t1 t2
  t1="$(tmp_beside "${file}")"; t2="$(tmp_beside "${index}")"
  KEY="${key}" VAL="${fval}" awk '!d && index($0, ENVIRON["KEY"]) == 1 { print ENVIRON["KEY"] " " ENVIRON["VAL"]; d = 1; next } { print }' "${file}" > "${t1}" \
    || { rm -f "${t1}" "${t2}"; die "edit failed"; }
  BASE="${base}" VAL="${ival}" awk -F'|' 'BEGIN { OFS = "|" }
    !d && index($0, "(" ENVIRON["BASE"] ")") && $0 ~ /^\|/ && NF >= 4 { $3 = " " ENVIRON["VAL"] " "; d = 1 } { print }' "${index}" > "${t2}" \
    || { rm -f "${t1}" "${t2}"; die "edit failed"; }
  replace_file "${t1}" "${file}"; replace_file "${t2}" "${index}"
  echo "set ${file} -> ${fval} (index: ${ival})"
}

cmd_handoff() {
  [ $# -ge 2 ] || die "usage: handoff <plan> <label> [file|-]"
  local plan="$1" label="$2" src="${3:--}" block tmp
  need_plan_path "${plan}"
  need_file "${plan}"; need_marker "${plan}"
  ! grep -qxF "## Handoffs → ${label}" "${plan}" || die "handoff for ${label} already present"
  block="$(mktemp "${TMPDIR:-/tmp}/sdd-block.XXXXXX")"
  { printf '## Handoffs → %s\n\n' "${label}"; read_input "${src}"; } > "${block}"
  tmp="$(tmp_beside "${plan}")"
  BLOCK="${block}" MARKER="${MARKER}" awk '
    { lines[NR] = $0 }
    END {
      m = 0
      for (i = 1; i <= NR; i++) if (lines[i] == ENVIRON["MARKER"]) { m = i; break }
      at = NR + 1
      for (i = m + 1; i <= NR; i++) if (lines[i] == "## Verification log") { at = i; break }
      for (i = 1; i < at; i++) print lines[i]
      if (at > 1 && lines[at - 1] !~ /^[ \t]*$/) print ""
      while ((getline b < ENVIRON["BLOCK"]) > 0) print b
      close(ENVIRON["BLOCK"])
      if (at <= NR) print ""
      for (i = at; i <= NR; i++) print lines[i]
    }' "${plan}" > "${tmp}" || { rm -f "${tmp}" "${block}"; die "edit failed"; }
  rm -f "${block}"
  replace_file "${tmp}" "${plan}"
  echo "handoff ${label} appended to ${plan}"
}

cmd_log() {
  [ $# -ge 2 ] || die "usage: log <plan> <text>"
  local plan="$1"; shift
  need_plan_path "${plan}"
  need_file "${plan}"
  append_line "${plan}" "${LOG_HEAD}" "- $(date +%F) $*" 0
}

cmd_follow_up() {
  [ $# -ge 2 ] || die "usage: follow-up <plan> <text>"
  local plan="$1"; shift
  need_plan_path "${plan}"
  need_file "${plan}"; need_marker "${plan}"
  append_line "${plan}" "${FU_HEAD}" "- $(date +%F) $*" 1
}

cmd_handback_check() {
  local body logplan="" label=""
  if [ "${1:-}" = "--log" ]; then
    [ $# -ge 3 ] || die "usage: handback-check --log <plan> <label> [file|-]"
    logplan="$2"; label="$3"; shift 3
    need_plan_path "${logplan}"
    need_file "${logplan}"
  fi
  body="$(read_input "${1:--}")"
  if printf '%s\n' "${body}" | grep -qF '| Step / gap |'; then return 0; fi
  echo "hand-back without a step table: treat as unknown"
  if [ -n "${logplan}" ]; then cmd_log "${logplan}" "handback: unknown ${label}"; fi
  return 1
}

git_state_block() { # HEAD, refs minus refs/sdd/, stash list
  echo "## git-state"
  git rev-parse HEAD 2>/dev/null || echo "no-head"
  git for-each-ref --format='%(refname) %(objectname)' | awk '$1 !~ /^refs\/sdd\//'
  echo "## stash"
  git stash list
}

snapshot_cmd() { # $1 = kind (porcelain|git-state), $2 = save|check, $3 = file
  local kind="$1" mode="$2" file="$3" now rc=0
  case "${mode}" in
    save) snapshot_body "${kind}" > "${file}" ;;
    check)
      need_file "${file}"
      now="$(mktemp "${TMPDIR:-/tmp}/sdd-snap.XXXXXX")"
      snapshot_body "${kind}" > "${now}"
      diff "${file}" "${now}" || rc=1
      rm -f "${now}"
      return "${rc}" ;;
    *) die "usage: ${kind} save|check <file>" ;;
  esac
}

snapshot_body() {
  if [ "$1" = "porcelain" ]; then git status --porcelain; fi
  git_state_block
}

cmd_git_state() {
  [ $# -eq 2 ] || die "usage: git-state save|check <file>"
  snapshot_cmd git-state "$1" "$2"
}

cmd_porcelain() {
  [ $# -eq 2 ] || die "usage: porcelain save|check <file>"
  snapshot_cmd porcelain "$1" "$2"
}

cmd_plan_lint() {
  [ $# -eq 1 ] || die "usage: plan-lint <plan>"
  need_file "$1"; need_marker "$1"
  local out
  out="$(MARKER="${MARKER}" awk '
    BEGIN { sq = sprintf("%c", 39); trq = "tr " sq "\\n" sq " " sq " " sq }
    $0 == ENVIRON["MARKER"] { exit }
    /^### S[0-9]+/ { id = $2 }
    index($0, "- **Done when:**") == 1 {
      line = $0; sid = (id == "" ? "S?" : id)
      if (line ~ /grep +-[A-Za-z]*c/) print "plan-lint: " sid ": grep -c"
      if (line ~ /\.md/ && index(line, trq) == 0) {
        rest = line; hit = 0
        while (!hit && (p = index(rest, "grep")) > 0) {
          rest = substr(rest, p + 4); s = rest
          while (match(s, /^ +-[-A-Za-z0-9=]*/)) s = substr(s, RLENGTH + 1)
          sub(/^ +/, "", s)
          q = substr(s, 1, 1)
          if (q == sq || q == "\"") {
            e = index(substr(s, 2), q)
            if (e > 0 && index(substr(s, 2, e - 1), " ") > 0) hit = 1
          }
        }
        if (hit) print "plan-lint: " sid ": multi-word grep on a .md file"
      }
    }' "$1")"
  if [ -n "${out}" ]; then printf '%s\n' "${out}"; return 1; fi
  echo "plan-lint: ok"
}

index_status() { # <index file> <basename> -> column-2 cell of its row, or none
  BASE="$2" awk -F'|' 'index($0, "(" ENVIRON["BASE"] ")") && $0 ~ /^\|/ && NF >= 4 { v = $3; gsub(/^ +| +$/, "", v); print v; f = 1; exit } END { if (!f) print "none" }' "$1"
}

cmd_status_check() {
  [ $# -eq 0 ] || die "usage: status-check"
  local f idx kv fval want have bad=0 dir
  if [ -f docs/plans/README.md ]; then
    for f in docs/plans/[0-9]*.md; do
      [ -f "${f}" ] || continue
      kv="$(file_status_key_value "${f}")"; [ -n "${kv}" ] || continue
      fval="${kv#*|}"; want="${fval}"
      if [ "${fval}" = "draft" ] && grep -q '^Steps: pending decisions' "${f}"; then want="draft (decisions)"; fi
      have="$(index_status docs/plans/README.md "$(basename "${f}")")"
      if [ "${want}" != "${have}" ]; then echo "status-check: ${f} file=${want} index=${have}"; bad=1; fi
    done
  fi
  for f in specs/*.md */specs/*.md; do
    [ -f "${f}" ] || continue
    [ "$(basename "${f}")" != "README.md" ] || continue
    dir="$(dirname "${f}")"; idx="${dir}/README.md"
    [ -f "${idx}" ] || continue
    kv="$(file_status_key_value "${f}")"; [ -n "${kv}" ] || continue
    fval="${kv#*|}"
    have="$(index_status "${idx}" "$(basename "${f}")")"
    if [ "${fval}" != "${have}" ]; then echo "status-check: ${f} file=${fval} index=${have}"; bad=1; fi
  done
  if [ "${bad}" = 1 ]; then return 1; fi
  echo "status-check: ok"
}

cmd_agent() {
  [ $# -eq 4 ] || die "usage: agent <plan|-> <stage> <agentId> <agentType>"
  local plan="$1" stage="$2" id="$3" type="$4" s found=0 line
  for s in ${STAGES}; do if [ "${s}" = "${stage}" ]; then found=1; fi; done
  [ "${found}" = 1 ] || die "unknown stage: ${stage}"
  printf '%s' "${id}" | grep -Eq '^[A-Za-z0-9]+$' || die "bad agentId: ${id}"
  printf '%s' "${type}" | grep -Eq '^[a-z][a-z-]*$' || die "bad agentType: ${type}"
  line="agent: ${stage} ${id} ${type} $(date -u +%FT%TZ)"
  if [ "${plan}" = "-" ]; then
    mkdir -p .sdd
    printf '%s\n' "- $(date +%F) ${line}" >> .sdd/pending-agents.log
  else
    cmd_log "${plan}" "${line}"
  fi
}

cmd_agent_flush() {
  [ $# -eq 1 ] || die "usage: agent-flush <plan>"
  need_file "$1"
  [ -f .sdd/pending-agents.log ] || return 0
  local line
  while IFS= read -r line || [ -n "${line}" ]; do
    [ -n "${line}" ] || continue
    append_line "$1" "${LOG_HEAD}" "${line}" 0
  done < .sdd/pending-agents.log
  rm -f .sdd/pending-agents.log
}

cmd_usage_scan() {
  command -v node >/dev/null 2>&1 || die "node not found"
  case "$#" in
    0) node "${here}/usage-scan.mjs" --root "${root}" ;;
    2) [ "$1" = "--session" ] || die "usage: usage-scan [--session <id>]"
       node "${here}/usage-scan.mjs" --root "${root}" --session "$2" ;;
    *) die "usage: usage-scan [--session <id>]" ;;
  esac
}

cmd_flags() {
  command -v node >/dev/null 2>&1 || die "node not found"
  [ "$#" -eq 1 ] || die "usage: flags <plan>"
  node "${here}/flags.mjs" --root "${root}" --plan "$1"
}

cmd_cost() {
  command -v node >/dev/null 2>&1 || die "node not found"
  [ "$#" -eq 1 ] || die "usage: cost <plan>"
  node "${here}/cost.mjs" --root "${root}" --plan "$1"
}

cmd_stages() { local s; for s in ${STAGES}; do echo "${s}"; done; }

cmd_checkpoint() {
  [ $# -eq 2 ] || die "usage: checkpoint <NN> <label>"
  case "$1" in ''|*[!0-9]*) die "NN must be digits" ;; esac
  case "$2" in ''|*[!A-Za-z0-9._-]*) die "label must match [A-Za-z0-9._-]+" ;; esac
  make_tree "refs/sdd/$1/$2"
}

cmd_delta() {
  [ $# -ge 1 ] && [ $# -le 2 ] || die "usage: delta <treeA> [treeB]"
  local b="${2:-}"
  need_tree "$1"
  if [ -n "${b}" ]; then need_tree "${b}"; fi
  if [ -z "${b}" ]; then b="$(make_tree "")"; fi
  git diff --name-status "$1" "${b}"
}

brief_of() { # stdin -> brief text (up to and incl. the marker), minus Status:/Execution:
  awk -v m="${MARKER}" '{ if ($0 ~ /^(Status|Execution):/) next; print; if ($0 == m) exit }'
}

cmd_brief_diff() {
  [ $# -eq 2 ] || die "usage: brief-diff <plan> <tree>"
  need_plan_path "$1"; need_tree "$2"
  need_file "$1"; need_marker "$1"
  local a b rc=0
  a="$(mktemp "${TMPDIR:-/tmp}/sdd-a.XXXXXX")"; b="$(mktemp "${TMPDIR:-/tmp}/sdd-b.XXXXXX")"
  git show "$2:$1" 2>/dev/null | brief_of > "${a}" || { rm -f "${a}" "${b}"; die "cannot read $1 at $2"; }
  brief_of < "$1" > "${b}"
  diff "${a}" "${b}" || rc=1
  rm -f "${a}" "${b}"
  return "${rc}"
}

cmd_state() {
  [ $# -eq 1 ] || die "usage: state <spec|plan path>"
  local path="$1" spec="" plan="" kv sstat="" pstat="" last="" handoffs=0 exec_mode="" log_last
  need_file "${path}"
  case "${path}" in
    docs/plans/*) plan="${path}"
      spec="$(grep -m1 '^Spec:' "${plan}" | grep -o '[A-Za-z0-9_./-]*\.md' | head -1 || true)" ;;
    *) spec="${path}"
      plan="$(grep -l "^Spec: .*${spec}" docs/plans/*.md 2>/dev/null | sort | tail -1 || true)" ;;
  esac
  if [ -n "${spec}" ] && [ -f "${spec}" ]; then
    kv="$(file_status_key_value "${spec}")"; sstat="${kv#*|}"
  fi
  if [ -z "${plan}" ]; then
    case "${sstat}" in
      draft)
        if grep -q 'NEEDS CLARIFICATION' "${spec}"; then
          echo "stage: spec-answers"; echo "because: spec Status is draft with open [NEEDS CLARIFICATION] markers"
        else
          echo "stage: spec-approve"; echo "because: spec Status is draft with no open questions"
        fi ;;
      approved|active) echo "stage: research"; echo "because: spec Status is ${sstat} and no plan names it in a Spec: line" ;;
      implemented|done) echo "stage: close"; echo "because: spec is ${sstat} and has no plan; nothing to resume" ;;
      *) echo "stage: intake"; echo "because: no readable spec status (${sstat:-none}) and no plan" ;;
    esac
    return 0
  fi
  kv="$(file_status_key_value "${plan}")"; pstat="${kv#*|}"
  exec_mode="$(grep -m1 '^Execution:' "${plan}" | sed 's/^Execution:[ ]*//' || true)"
  handoffs="$(grep -c '^## Handoffs →' "${plan}" || true)"
  log_last="$(awk -v h="${LOG_HEAD}" '$0 == h { s = 1; next } /^## / { s = 0 } s && /^- / { t = $0; sub(/^- [0-9-]+ /, "", t); if (t ~ /^(agent|handback|resume|plan-lint|status-check|retro|retro-fact):/) next; l = $0 } END { print l }' "${plan}")"
  last="$(printf '%s\n' "${log_last}" | sed -E 's/^- [0-9]{4}-[0-9]{2}-[0-9]{2} //')"
  case "${pstat}" in
    draft)
      if grep -q '^Steps: pending decisions' "${plan}"; then
        echo "stage: plan-decisions"; echo "because: plan ${plan} is draft and ends with 'Steps: pending decisions'"
      else
        echo "stage: plan-approve"; echo "because: plan ${plan} is a full draft (no pending decisions)"
      fi ;;
    approved) echo "stage: implement"; echo "because: plan ${plan} is approved (Execution: ${exec_mode:-multi-agent}), no implementer run yet" ;;
    in-progress)
      case "${last}" in
        plan-verifier*) echo "stage: sign-off"; echo "because: last log line is a plan-verifier result: ${last}" ;;
        "review iteration"*)
          if printf '%s\n' "${last}" | grep -q 'fix 0'; then
            echo "stage: review"; echo "because: last review iteration has fix 0; verifier re-run pending: ${last}"
          else
            echo "stage: fix-loop"; echo "because: last review iteration still has fix items: ${last}"
          fi ;;
        it-suite*) echo "stage: review"; echo "because: last log line is the it-suite result: ${last}" ;;
        *)
          if [ "${handoffs}" -gt 0 ]; then
            echo "stage: it-suite"; echo "because: in-progress with ${handoffs} handoff(s) and no it-suite/review log line yet"
          else
            echo "stage: implement"; echo "because: in-progress with no handoff recorded"
          fi ;;
      esac ;;
    done)
      case "${last}" in
        metrics*) echo "stage: handover"; echo "because: last log line is metrics" ;;
        self-review*) echo "stage: metrics"; echo "because: last log line is self-review" ;;
        insights*) echo "stage: self-review"; echo "because: last log line is insights" ;;
        docs*) echo "stage: insights"; echo "because: last log line is docs" ;;
        *)
          case "${sstat}" in
            implemented|done|"") echo "stage: docs"; echo "because: plan is done${sstat:+, spec is ${sstat}}; docs/insights/self-review are not tracked yet" ;;
            *) echo "stage: close"; echo "because: plan is done but spec Status is ${sstat}" ;;
          esac ;;
      esac ;;
    abandoned) echo "stage: none"; echo "because: plan ${plan} is abandoned" ;;
    *) echo "stage: intake"; echo "because: unrecognised plan Status '${pstat}'" ;;
  esac
}

# ---- dispatch ------------------------------------------------------------

sub="${1:-help}"; [ $# -gt 0 ] && shift
case "${sub}" in
  set-status) cmd_set_status "$@" ;;
  handoff) cmd_handoff "$@" ;;
  log) cmd_log "$@" ;;
  follow-up) cmd_follow_up "$@" ;;
  handback-check) cmd_handback_check "$@" ;;
  porcelain) cmd_porcelain "$@" ;;
  git-state) cmd_git_state "$@" ;;
  plan-lint) cmd_plan_lint "$@" ;;
  status-check) cmd_status_check "$@" ;;
  agent) cmd_agent "$@" ;;
  agent-flush) cmd_agent_flush "$@" ;;
  usage-scan) cmd_usage_scan "$@" ;;
  flags) cmd_flags "$@" ;;
  cost) cmd_cost "$@" ;;
  stages) cmd_stages ;;
  checkpoint) cmd_checkpoint "$@" ;;
  delta) cmd_delta "$@" ;;
  brief-diff) cmd_brief_diff "$@" ;;
  state) cmd_state "$@" ;;
  help|-h|--help) usage ;;
  *) usage >&2; exit 2 ;;
esac
