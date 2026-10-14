# External research — plan 39 CI split: composite actions, paths filters, deleted workflow

Researcher report (external mode, read-only), 2026-10-14, saved by the main session. All pages opened via WebFetch on that date; GitHub Docs pages are undated.

## Answer
- `**/AGENTS.md` matches the root `AGENTS.md` (cheat sheet: `**/README.md` matches `README.md` and `js/README.md`). `docs/**` matches nested files.
- `paths` and `paths-ignore` cannot be combined for one event; use `paths` with `!` negations after the positive patterns.
- A workflow skipped by `paths` leaves its checks "Pending"; a PR that requires them is blocked.
- Composite `outputs:` mapped from step outputs is documented. Not documented in the pages opened: fork behaviour of local composite actions, `secrets.*` inside composite actions, a PR that deletes/renames a workflow file.

Confidence: high for Q2, medium for the output mapping in Q1, low for the fork and secrets parts of Q1 and for Q3.

## Sources
| # | URL | Type |
|---|-----|------|
| 1 | https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax (incl. filter pattern cheat sheet) | primary |
| 2 | https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax | primary |
| 3 | https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows | primary |
| 4 | https://docs.github.com/en/actions/reference/security/secure-use | primary |

## Evidence
| Claim | Kind | Src | What it says |
|---|---|---|---|
| `**/AGENTS.md` matches the root file | inference | [1] | `**/README.md` = "A README.md file anywhere in the repository", matches `README.md` and `js/README.md` |
| `.claude/skills/**` matches nested files | inference | [1] | `docs/**` matches `docs/README.md`, `docs/mona/octocat.txt`; dot-directory case not shown |
| `paths` + `paths-ignore` not combinable | fact | [1] | "You cannot use both the `paths` and `paths-ignore` filters for the same event in a workflow." |
| Negation rules | fact | [1] | a later matching `!` pattern excludes; at least one positive pattern required |
| `paths` with `branches` | fact | [1] | runs only when both are satisfied |
| Skipped workflow → checks pending | fact | [1] | checks of a path-skipped workflow "will remain in a "Pending" state"; a PR requiring them is blocked |
| Composite outputs via `$GITHUB_OUTPUT` | fact | [2] | step needs an `id`; `outputs.<x>.value` required, may be `${{ steps.<id>.outputs.<y> }}` |
| `shell` required on composite `run` steps | fact | [2] | "Required if `run` is set" |
| Job maps composite outputs to job `outputs:` | inference | [2] | `steps.<action-step-id>.outputs.<x>`; job-level mapping not shown on a page |
| `pull_request` ref is the merge ref | fact | [3] | `GITHUB_REF` = `refs/pull/N/merge`; checkout uses it by default; head is `github.event.pull_request.head.sha` |
| Local `./.github/actions/x` read from the checkout | inference | [3] | resolves against the checked-out merge commit |
| Fork behaviour | fact | [3] | no secrets except read-only `GITHUB_TOKEN`; first-time contributors may need approval |
| Secrets inside composite actions | not established | [2] | only the `inputs` context documented |
| Pass secrets as inputs/env | inference | [2], [4] | `with: key: ${{ secrets.X }}` or `env:`; empty on fork PRs |

## Applies to this repo
- Plan 39 risk (`**/AGENTS.md` vs the root file) resolved by the cheat sheet row.
- Several path-filtered workflows: any one used as a required check can stay Pending forever; required checks should come from an always-running job or an unfiltered workflow. Branch protection of this repo not checked (main session: `gh` not installed locally; the current single `harness-evals.yml` is already path-filtered and non-blocking).
- Fork PRs: steps needing the LLM key get an empty value — gate them on the input being non-empty.

## Not established
- Fork behaviour of local composite actions (inferred to work from the merge-ref checkout).
- Whether `secrets.*` is readable inside a composite action.
- Q3: a PR that deletes/renames a workflow file and the old check name (troubleshooting page 404); inferred: an old required check stays "Expected" until branch protection is edited.
- Whether `paths` is evaluated against the PR diff vs the merge base; whether `**` matches dot-directories like `.claude/`.
