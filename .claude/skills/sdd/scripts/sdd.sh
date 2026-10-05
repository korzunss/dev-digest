#!/usr/bin/env bash
# sdd.sh - the one entry point for the main session's edits and git checkpoints
# of the /sdd pipeline. Run from anywhere inside the repo; it cd's to the root.
# BSD/macOS safe: no in-place sed, no GNU-only flags. Never touches the real index.
set -euo pipefail

MARKER='<!-- implementer-brief:end -->'
LOG_HEAD='## Verification log'
FU_HEAD='## Follow-ups'

die() { echo "sdd: $*" >&2; exit 2; }

usage() {
  cat <<'USAGE'
sdd.sh <subcommand> [args]
  set-status <plan|spec> <path> <status>   rewrite Status: line and index row cell
  handoff <plan> <label> [file|-]          append "## Handoffs -> <label>" below the brief marker
  log <plan> <text>                        append "- <date> <text>" to ## Verification log
  follow-up <plan> <text>                  append "- <date> <text>" to ## Follow-ups
  handback-check [file|-]                  exit 0 when the report has the implementer step table
  porcelain save <file> | check <file>     snapshot / compare `git status --porcelain`
  checkpoint <NN> <label>                  pin the work tree as refs/sdd/<NN>/<label> (temp index)
  delta <treeA> [treeB]                    name-status diff between two trees (B defaults to now)
  brief-diff <plan> <tree>                 plan text above the marker vs <tree> (ignores Status:/Execution:)
  state <spec|plan path>                   print "stage: <id>" and one "because:" line
  help                                     this text
USAGE
}

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
  need_file "${plan}"
  append_line "${plan}" "${LOG_HEAD}" "- $(date +%F) $*" 0
}

cmd_follow_up() {
  [ $# -ge 2 ] || die "usage: follow-up <plan> <text>"
  local plan="$1"; shift
  need_file "${plan}"; need_marker "${plan}"
  append_line "${plan}" "${FU_HEAD}" "- $(date +%F) $*" 1
}

cmd_handback_check() {
  local body
  body="$(read_input "${1:--}")"
  if printf '%s\n' "${body}" | grep -qF '| Step / gap |'; then return 0; fi
  echo "hand-back without a step table: treat as unknown"
  return 1
}

cmd_porcelain() {
  [ $# -eq 2 ] || die "usage: porcelain save|check <file>"
  case "$1" in
    save) git status --porcelain > "$2" ;;
    check)
      need_file "$2"
      local now rc=0
      now="$(mktemp "${TMPDIR:-/tmp}/sdd-porc.XXXXXX")"
      git status --porcelain > "${now}"
      diff "$2" "${now}" || rc=1
      rm -f "${now}"
      return "${rc}" ;;
    *) die "usage: porcelain save|check <file>" ;;
  esac
}

cmd_checkpoint() {
  [ $# -eq 2 ] || die "usage: checkpoint <NN> <label>"
  case "$1" in ''|*[!0-9]*) die "NN must be digits" ;; esac
  case "$2" in ''|*[!A-Za-z0-9._-]*) die "label must match [A-Za-z0-9._-]+" ;; esac
  make_tree "refs/sdd/$1/$2"
}

cmd_delta() {
  [ $# -ge 1 ] && [ $# -le 2 ] || die "usage: delta <treeA> [treeB]"
  local b="${2:-}"
  if [ -z "${b}" ]; then b="$(make_tree "")"; fi
  git diff --name-status "$1" "${b}"
}

brief_of() { # stdin -> brief text (up to and incl. the marker), minus Status:/Execution:
  awk -v m="${MARKER}" '{ if ($0 ~ /^(Status|Execution):/) next; print; if ($0 == m) exit }'
}

cmd_brief_diff() {
  [ $# -eq 2 ] || die "usage: brief-diff <plan> <tree>"
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
  log_last="$(awk -v h="${LOG_HEAD}" '$0 == h { s = 1; next } /^## / { s = 0 } s && /^- / { l = $0 } END { print l }' "${plan}")"
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
        self-review*) echo "stage: handover"; echo "because: last log line is self-review" ;;
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
  checkpoint) cmd_checkpoint "$@" ;;
  delta) cmd_delta "$@" ;;
  brief-diff) cmd_brief_diff "$@" ;;
  state) cmd_state "$@" ;;
  help|-h|--help) usage ;;
  *) usage >&2; exit 2 ;;
esac
