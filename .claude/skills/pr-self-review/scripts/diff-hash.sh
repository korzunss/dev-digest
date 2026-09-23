#!/usr/bin/env bash
# Stable hash of "all open changes vs origin/main" — committed-not-merged + staged + unstaged
# + untracked file contents. Used by BOTH the review (to stamp .pr-self-review.json) and the
# PreToolUse hook (to detect that the diff moved since the last PASS). Keep the two in sync by
# always going through this one script.
set -euo pipefail

# Pick the SHA-256 tool ONCE, before the pipeline. Neither candidate is
# universal: `sha256sum` is coreutils (absent on macOS), `shasum` is a Perl
# script from Digest::SHA (present on macOS and any Linux carrying Perl, absent
# from minimal images like Alpine or distroless). Both print `<hash>  -`, so the
# awk below is unchanged and the hash itself is identical either way — switching
# tools cannot invalidate a stored PASS.
#
# Deliberately NOT a `cmd_a || cmd_b` chain inside the pipeline: if the first
# tool failed after reading part of stdin, the fallback would run on a drained
# stream and hash nothing, which is worse than failing — a stable hash of the
# empty string would make every diff look unchanged.
if command -v sha256sum >/dev/null 2>&1; then
  SHA=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  SHA=(shasum -a 256)
else
  echo "diff-hash: no sha256 tool found (looked for sha256sum, shasum)" >&2
  exit 1
fi

BASE="$(git merge-base origin/main HEAD 2>/dev/null || git rev-parse HEAD)"

{
  git diff "$BASE"
  # untracked files: include name + content so a new file invalidates a stale PASS
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    printf '\n--- untracked: %s ---\n' "$f"
    cat -- "$f" 2>/dev/null || true
  done < <(git ls-files --others --exclude-standard | sort)
} | "${SHA[@]}" | awk '{print $1}'
