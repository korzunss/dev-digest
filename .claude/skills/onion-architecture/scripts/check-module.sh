#!/usr/bin/env bash
# Onion edge checks for ONE server module, plus the repo-wide adapter checks.
#
#   check-module.sh <module> [--root <dir>]
#
# <module> is the folder name under server/src/modules/ (e.g. hotspots).
# --root points at another tree laid out like this repo (a draft or a worktree);
# the default is the current git repo. Comment lines are skipped, so a rule
# mentioned in a comment is not a hit. Exit 1 when any check has hits.
#
# A hit is a lead, not a verdict: check it against "Known exceptions" in SKILL.md
# and `git show HEAD:<file>` before you report it.
set -u

mod="${1:-}"
[ -z "$mod" ] && { echo "usage: check-module.sh <module> [--root <dir>]" >&2; exit 2; }
shift
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
while [ $# -gt 0 ]; do
  case "$1" in
    --root) root="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

src="$root/server/src"
dir="$src/modules/$mod"
[ -d "$dir" ] || { echo "no module folder: $dir" >&2; exit 2; }

hits=0
# grep_code <pattern> <paths...>: matches outside comment lines, paths relative to root.
grep_code() {
  local pat="$1"; shift
  grep -rnaE --include='*.ts' "$pat" "$@" 2>/dev/null \
    | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|\*|/\*)' \
    | grep -vE '\.test\.ts:' \
    | sed "s#^$root/##"
}
report() {
  local rule="$1" out="$2"
  if [ -n "$out" ]; then
    echo "[$rule]"; echo "$out" | sed 's/^/  /'; hits=1
  else
    echo "[$rule] ok"
  fi
}

# Module files except the repository, which is the one place db/schema belongs.
non_repo=$(find "$dir" -name '*.ts' ! -name '*.test.ts' ! -name 'repository*.ts' ! -path '*/repository/*')

report "services-depend-on-ports / routes-are-thin" \
  "$(grep_code "from '(\.\./)+adapters/" "$dir")"
report "db-confined-to-repositories" \
  "$( [ -n "$non_repo" ] && grep_code "db/schema|drizzle-orm" $non_repo )"
report "no-cross-module-internals (keep only 'import type' from <other>/types.js)" \
  "$(grep_code "from '\.\./[a-z-]+/" "$dir" | grep -vE "import type .*from '\.\./[a-z-]+/types\.js'")"
report "env-at-chokepoints" \
  "$(grep_code "process\.env" "$dir")"
report "one-adapter-per-system (SDK client or raw fetch in a module)" \
  "$(grep_code "simpleGit\(|new Octokit\(|new (OpenAI|Anthropic)\(|(^|[^.[:alnum:]_])fetch\(" "$dir")"

# Repo-wide: these catch a new adapter that the module wires in.
report "adapters-dont-know-modules (astgrep, depgraph -> repo-intel/constants are the known exceptions)" \
  "$(grep_code "from '(\.\./)+modules/" "$src/adapters" | grep -vE '^server/src/adapters/(astgrep|depgraph)/index\.ts:.*repo-intel/constants')"
report "one-adapter-per-system (a second client beside the one adapter that owns it)" \
  "$( { grep_code "simpleGit\(" "$src" | grep -v '^server/src/adapters/git/simple-git\.ts:'
        grep_code "new Octokit\(" "$src" | grep -v '^server/src/adapters/github/octokit\.ts:'
        grep_code "new (OpenAI|Anthropic)\(" "$src" | grep -vE '^server/src/adapters/llm/(openai|anthropic|openrouter)\.ts:'
        grep_code "(^|[^.[:alnum:]_])fetch\(" "$src/adapters" | grep -v '^server/src/adapters/gitlab/rest\.ts:'; } )"
report "env-at-chokepoints (repo-wide, outside the known chokepoints)" \
  "$(grep_code "process\.env" "$src" \
      | grep -vE '^server/src/(platform/config|adapters/secrets/local|adapters/git/simple-git|db/(migrate|seed|backfill-run-cost))\.ts:' \
      | grep -vE '^server/src/(vendor/|db/seed-conventions\.ts)')"

exit $hits
