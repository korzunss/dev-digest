#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash). Denies `git commit` unless the typecheck and unit tests of
# every package the commit touches are green. Wired in .claude/settings.json.
#
# A deterministic gate, not an eval: "never commit on red tests" must hold every time, so it is
# enforced here rather than asked for in a prompt. There is deliberately no env-var override —
# anything the agent can type into the command line it could also use to skip the gate. A human
# who really needs to commit on red runs `! git commit …` themselves (hooks do not see that).
#
# Decision model (exit 2 = deny, stderr is shown to the agent; exit 0 = allow):
#   - command is not a git commit ......................... allow
#   - hook input unparsable but mentions git + commit ..... deny  (never fail open on a commit)
#   - no package with tests touched (docs, .claude, …) .... allow
#   - a touched package has untracked files, or unstaged
#     edits while the commit is not -a/--all .............. deny  (tests would see a different tree
#                                                                  than the one being committed)
#   - this exact tree already passed (cached) ............. allow
#   - any package's typecheck or unit tests fail .......... deny, with the failing output tail
#   - every touched package green ......................... allow, tree hash cached
#
# Per package (unit lane only — `.it` tests need Docker and run in CI):
#   server        pnpm typecheck + vitest run --exclude '**/*.it.test.ts'
#   client        pnpm typecheck + pnpm test
#   reviewer-core npm run typecheck + npm test   (also re-runs server: it imports reviewer-core)
#   mcp-server    pnpm typecheck + pnpm test
#   e2e, evals    typecheck only (their tests drive a browser / call a model)
set -uo pipefail

input="$(cat)"
cmd="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write((j.tool_input&&j.tool_input.command)||"")}catch{process.exit(3)}})' 2>/dev/null)"
parsed=$?

if [ "$parsed" -ne 0 ]; then
  # Unreadable hook input: allow ordinary commands (a broken hook must not brick the session),
  # but never let something that looks like a commit through unchecked.
  if printf '%s' "$input" | grep -q 'git' && printf '%s' "$input" | grep -q 'commit'; then
    echo "⛔ test-gate: could not read the hook input, and it mentions a git commit — blocked." >&2
    exit 2
  fi
  exit 0
fi

# `git commit`, `git -C dir commit`, `cd x && git commit -m …`, `/usr/bin/git commit`,
# `bash -c "git commit"`, `'git' commit` — but not `git commit-tree`.
COMMIT_RE="(^|[^[:alnum:]_-])git['\"]?([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+['\"]?commit(['\"[:space:]]|\$)"
printf '%s' "$cmd" | grep -Eq "$COMMIT_RE" || exit 0

# -a / --all / a combined short flag such as -am also commits unstaged tracked edits.
all=0
printf '%s' "$cmd" | grep -Eq "commit.*([[:space:]]--all([[:space:]]|\$)|[[:space:]]-[[:alpha:]]*a)" && all=1

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$ROOT" ] || exit 0
cd "$ROOT" || exit 0

# What the commit will contain: the index, plus unstaged tracked edits only for -a / --all.
if [ "$all" -eq 1 ]; then
  files="$( { git diff --cached --name-only; git diff --name-only; } 2>/dev/null | sort -u)"
else
  files="$(git diff --cached --name-only 2>/dev/null)"
fi
[ -n "$files" ] || exit 0

pkgs=""
add() { case " $pkgs " in *" $1 "*) ;; *) pkgs="$pkgs $1" ;; esac; }
while IFS= read -r f; do
  case "$f" in
    server/clones/*) ;;
    server/*) add server ;;
    client/*) add client ;;
    reviewer-core/*) add reviewer-core; add server ;;
    mcp-server/*) add mcp-server ;;
    e2e/*) add e2e ;;
    evals/*) add evals ;;
  esac
done <<< "$files"
[ -n "$pkgs" ] || exit 0

# The tests run on the working tree, so it must equal what is being committed in every touched
# package: no untracked files there, and no unstaged edits unless the commit takes them (-a).
for p in $pkgs; do
  stray="$(git ls-files --others --exclude-standard -- "$p" 2>/dev/null | head -5)"
  [ "$all" -eq 1 ] || stray="$stray$(git diff --name-only -- "$p" 2>/dev/null | head -5)"
  if [ -n "$stray" ]; then
    echo "⛔ test-gate: commit blocked — $p/ has changes that are not part of this commit, so the" >&2
    echo "   tests would check a different tree than the one you commit. Stage them (git add) or" >&2
    echo "   set them aside (git stash push --include-untracked --keep-index), then commit again:" >&2
    printf '%s\n' "$stray" | sed 's/^/   | /' >&2
    exit 2
  fi
done

# Cache key = the committed tree (+ the unstaged diff for -a): the same content never runs twice.
tree="$(git write-tree 2>/dev/null || echo none)"
extra=""; [ "$all" -eq 1 ] && extra="$(git diff 2>/dev/null)"
key="$(printf '%s\n%s\n%s' "$tree" "$extra" "$pkgs" | shasum -a 256 | cut -c1-16)"
cache="$(git rev-parse --git-dir)/test-gate.pass"
if [ -f "$cache" ] && grep -qx "$key" "$cache"; then
  echo "test-gate: tests already green for this tree ($key) — commit allowed." >&2
  exit 0
fi

log="$(mktemp -t test-gate.XXXXXX)"
run() { # <pkg> <label> <command…>
  local pkg="$1" label="$2"; shift 2
  echo "test-gate: $pkg — $label" >&2
  if ! (cd "$ROOT/$pkg" && "$@") >"$log" 2>&1; then
    echo "⛔ test-gate: commit blocked — \`$label\` failed in $pkg/." >&2
    echo "   Fix it (or the test) and commit again. Last lines of the output:" >&2
    tail -n 40 "$log" | sed 's/^/   | /' >&2
    rm -f "$log"
    exit 2
  fi
}

for p in $pkgs; do
  case "$p" in
    server)        run server typecheck pnpm typecheck
                   run server "unit tests" pnpm exec vitest run --exclude '**/*.it.test.ts' ;;
    client)        run client typecheck pnpm typecheck
                   run client "unit tests" pnpm test ;;
    reviewer-core) run reviewer-core typecheck npm run typecheck
                   run reviewer-core "unit tests" npm test ;;
    mcp-server)    run mcp-server typecheck pnpm typecheck
                   run mcp-server "unit tests" pnpm test ;;
    e2e)           run e2e typecheck npm run typecheck ;;
    evals)         run evals typecheck pnpm typecheck ;;
  esac
done
rm -f "$log"

echo "$key" >> "$cache"
echo "test-gate: green in:$pkgs — commit allowed." >&2
exit 0
