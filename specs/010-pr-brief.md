# Spec: PR Brief (risk brief)
Spec ID: SPEC-10
Status: approved
Supersedes: none (builds on [006 — Intent layer](006-intent-layer.md), [007 — Smart Diff](007-smart-diff.md), [008 — Project Context](008-project-context.md) and the Blast Radius feature, [plan 18](../docs/plans/18-blast-radius.md))

## Problem & user

A reviewer often opens someone else's pull request knowing nothing about it. They do not
know why the change exists, what in it is risky, or which file to read first.
DevDigest already computes parts of that picture: the PR's intent (spec 006), the
role grouping of changed files (Smart Diff, spec 007) and the blast radius (plan
18). These are scattered, though, and nothing turns them into a short list of
concrete risks or a starting point for the review. The reviewer has to put that
picture together alone, every time, before reading any code.

## Goals / Non-goals

**Goals**
- One **PR Brief** block on the PR Overview tab that holds:
  - the latest review's verdict and score;
  - a short model-written summary of what the PR does and why;
  - the existing Intent and Blast radius cards;
  - two new model-written parts: **Risk areas** (each risk tied to a file) and **Review focus** (an ordered list of `file:line — reason` saying where to start).
- Exactly **one** model call per generation. The model gets pre-computed facts only, never diff hunk bodies, within a fixed input budget of **8,000 tokens**.
- No invented paths or lines: every file and line in the brief comes from the PR's diff or from the blast-radius map.
- The brief is stored per PR and bound to the head commit. A reload shows it at once, and a new commit marks it stale.
- One click goes from a focus item or a risk to that file (and line) in the Files changed tab.

**Non-goals**
- "Prior PRs touching these files" (PR history) in the brief. [user: answer to B8, 2026-10-06]
- An MCP tool that exposes the brief. [user: answer to B8, 2026-10-06]
- Process deliverables of the homework: committing the spec and plan before code, the cross-model plan-review note, the plan-verifier report, the workflow retro and the cost report. These are workflow artefacts, not product behaviour. [user: answer to B8, 2026-10-06]
- Classifying the PR's intent during brief generation. The brief uses only the stored intent. [user: answer to B3, 2026-10-06]
- Regenerating a stale brief automatically. [user: answer to B7, 2026-10-06]
- Sending diff hunk bodies, finding bodies or suggested fixes to the model.
- Choosing Project Context documents automatically from the PR's content (already a non-goal of spec 008).
- Changing how the Intent card, the Blast radius card or the Files changed tab compute their own data.

## User stories

- As a reviewer, I want a PR Brief block on the Overview tab with a Generate button when no brief exists, so that I can ask for a briefing in one click.
- As a reviewer, I want a short summary, the risk areas and a review focus list next to the Intent and Blast radius cards, so that I know why the PR exists, what is risky and where to start.
- As a reviewer, I want the brief to say which inputs were missing, partial or truncated, so that I know how far to trust it.
- As a reviewer, I want each risk to show its title, its file and a severity-coloured icon, and to expand into an explanation, so that I can triage risks at a glance.
- As a reviewer, I want to click a focus item or a risk and land on that file and line in Files changed, so that I start reading in the right place.
- As a reviewer, I want the brief to appear instantly on reload and to tell me when the PR has moved on, so that I neither pay twice nor read an outdated brief unknowingly.
- As a reviewer, I want a Refresh button, so that I can regenerate the brief when I choose to.

## Acceptance criteria (EARS)

**Block and generation**
- AC-1: The system SHALL show a "PR Brief" block at the top of the PR Overview tab, above the Intent and Blast radius cards.
- AC-2: WHILE no brief is stored for the PR, the system SHALL show a "Generate brief" button in the PR Brief block in place of the brief's content.
- AC-3: WHEN the user presses Generate brief or Refresh, the system SHALL make exactly one structured model call for that generation, with no schema re-ask, using the model selected for the `risk_brief` feature in Settings.
- AC-4: WHILE a brief generation for the PR is in progress, the system SHALL show a skeleton in place of the brief content and disable the Generate and Refresh buttons.
- AC-5: IF a generation is requested for a PR while another generation for the same PR is in progress, THEN the system SHALL NOT start a second model call.
- AC-6: WHEN a generation succeeds, the system SHALL store the brief for the PR, replacing any previous brief, and show its summary, Risk areas and Review focus.
- AC-7: IF the model call fails, or its output fails contract validation, THEN the system SHALL keep the previously stored brief unchanged (or no brief), and show an error with a retry action.
- AC-8: IF no model or no provider key is configured for the `risk_brief` feature, THEN the system SHALL refuse the generation without a model call and show a message pointing to Settings.
- AC-9: WHEN a generation's model call completes, the system SHALL write exactly one structured server log line for it, in the form `brief: <provider>/<model> tokens <in>/<out> cost <usd> duration_ms <d>`, containing no input or output content.

**Model input**
- AC-10: The system SHALL send the model only the facts listed in *Inputs and provenance*, and SHALL NOT send diff hunk bodies, finding bodies or suggested fixes.
- AC-11: The system SHALL keep the model input at or below 8,000 tokens, counted with the server's tokenizer. The budget covers the system prompt, the facts and a fixed reserve for the structured-output schema the provider receives, and the reserve is subtracted before the facts are fitted. [user: answer to B6, 2026-10-06] [user: cross-model review X11, 2026-10-06]
- AC-12: WHEN the assembled input exceeds the budget of AC-11, the system SHALL trim input groups in this order until it fits: attached specs, linked-issue body, PR description, blast-radius callers, blast-radius changed symbols, review findings, changed-file list. [user: answer to B6, 2026-10-06] [user: cross-model review X3, 2026-10-06]
- AC-13: WHEN an input group is trimmed, the system SHALL record that trim in the brief and show it in the PR Brief block as "truncated: <input>".
- AC-44: WHEN the blast-radius facts are collected for the model, the system SHALL cap the number of changed symbols, affected endpoints and affected crons. IF a cap or a trim cuts any blast-radius entry, THEN the system SHALL record it as `truncated: blast_radius`. [user: cross-model review X3, 2026-10-06]
- AC-45: IF the input still exceeds the budget of AC-11 after every trim of AC-12, THEN the system SHALL make no model call, keep the previously stored brief unchanged (or no brief), and report an "input over budget" failure that is shown differently from a model failure. [user: cross-model review X3, 2026-10-06]
- AC-14: WHEN a brief is generated, the system SHALL use the stored intent of the PR if one exists and SHALL NOT trigger intent classification. [user: answer to B3, 2026-10-06]
- AC-15: IF the stored intent is stale (the PR's head or description changed since classification), THEN the system SHALL still use it and record "intent stale" in the brief's missing inputs. [user: answer to B3, 2026-10-06]
- AC-16: IF the PR has no stored intent, THEN the system SHALL generate the brief without it and record "intent" as missing. [user: answer to B3, 2026-10-06]
- AC-17: IF the blast radius is degraded, THEN the system SHALL generate the brief with the partial blast data and record "blast radius partial" with the degradation reason. [user: answer to B3, 2026-10-06]
- AC-18: IF the blast radius cannot be obtained at all, THEN the system SHALL generate the brief without it and record "blast radius" as missing.
- AC-19: WHERE the PR has a latest review (the newest review of kind `review` from any agent), the system SHALL send that review's non-dismissed findings to the model as file, line, severity and title only. [user: answer to B2, 2026-10-06]
- AC-20: IF the PR has no review of kind `review`, THEN the system SHALL generate the brief without findings and record "review findings" as missing. [user: answer to B2, 2026-10-06]
- AC-21: IF the linked issue or an attached spec cannot be read, THEN the system SHALL generate the brief without it and record it as missing.
- AC-22: WHEN the brief has missing, partial or truncated inputs, the system SHALL list each one explicitly in the PR Brief block.

**Output validation**
- AC-23: WHEN the model returns its output, the system SHALL drop every risk file reference, and every review-focus item, whose file is neither among the PR's changed files nor in the blast-radius map.
- AC-24: WHEN the model returns its output, the system SHALL drop every review-focus item whose line falls outside both the file's changed-line ranges (from hunk headers) and that file's blast-caller lines. [user: answer to B1, 2026-10-06]
- AC-25: IF a risk has no file reference left after validation, THEN the system SHALL drop that risk.
- AC-26: The system SHALL keep the model's order of review-focus items, remove duplicate `file:line` items, and show at most 6 focus items and at most 5 file references per risk.
- AC-27: IF no risk survives validation, THEN the system SHALL show the "No notable risks flagged" empty state in Risk areas. The same applies to Review focus when no focus item survives, with its own empty-state message.

**Display**
- AC-28: The system SHALL show each risk with its title, its first file reference and an icon coloured by its severity (high, medium, low).
- AC-29: WHEN the user expands a risk, the system SHALL show that risk's explanation and all of its file references.
- AC-30: The system SHALL show Review focus as an ordered list of `file:line — reason` items, under a heading that shows the item count.
- AC-31: The system SHALL render the brief's summary, risk text and focus reasons as untrusted text that does not render images or raw HTML.
- AC-32: WHERE the PR has a latest review (the same newest review of kind `review` used in AC-19), the system SHALL show a verdict banner at the top of the PR Brief block with that review's verdict and score, and the brief's summary under it.
- AC-33: IF the PR has no review of kind `review`, THEN the system SHALL show the brief's summary without a verdict or score.
- AC-34: The system SHALL show the existing Intent and Blast radius cards inside the PR Brief layout, with their current live data, whether or not a brief exists.
- AC-35: The system SHALL take every PR Brief label and message from the `brief` message namespace. The one exception is the reused verdict banner, whose labels stay in its existing review namespace. [user: cross-model review X7, 2026-10-06]

**Navigation**
- AC-36: WHEN the user clicks a review-focus item whose file is in the PR's diff, the system SHALL switch to the Files changed tab, expand that file and scroll to the item's line.
- AC-37: WHEN the user clicks a risk's file reference whose file is in the PR's diff, the system SHALL switch to the Files changed tab and scroll to that file.
- AC-38: IF the clicked file is not in the PR's diff (a blast-map-only file), THEN the system SHALL stay on the Overview tab and show "File not in this PR's diff".
- AC-39: WHEN the Files changed tab is opened through a focus item or a risk, the system SHALL briefly highlight the target line (or file header).

**Caching and staleness**
- AC-40: WHEN the Overview tab opens for a PR with a stored brief, the system SHALL show that brief without a model call.
- AC-41: The system SHALL store the head commit SHA the brief was generated at, together with the generation time and the model used.
- AC-42: WHILE the PR's current head SHA differs from the brief's stored head SHA, the system SHALL show the stored brief marked stale, with a "PR has new commits" note and the Refresh button. [user: answer to B7, 2026-10-06]
- AC-43: The system SHALL NOT start a brief generation without an explicit Generate or Refresh action from the user. [user: answer to B7, 2026-10-06]

## Edge cases

- **PR with no changed files** (an empty diff or a diff that cannot be read): the brief is still generated from the description and intent. Risk areas and Review focus will probably be empty after validation (AC-23/AC-27).
- **Files with no `patch`** (binary, too large, or omitted by the forge): no changed-line ranges. A focus item on such a file survives only on one of its blast-caller lines (AC-24), so in practice it is dropped.
- **Renamed files:** the post-rename path is the PR's file path for validation and navigation.
- **A huge PR** (hundreds of files): the file list is the last input group trimmed (AC-12). If it is trimmed, the brief says so (AC-13). If the input is still over budget after every trim, there is no model call and the failure is reported as "input over budget" (AC-45).
- **The model returns only invented paths:** every item is dropped and the empty states show (AC-27). This is not an error.
- **A blast-map-only file in a risk or focus item:** it is kept (AC-23), but clicking it shows "File not in this PR's diff" (AC-38).
- **A new commit lands during a generation:** the brief stores the head SHA it was built from, so it shows as stale right away (AC-42).
- **Two tabs or double-clicks:** one model call (AC-5).
- **Generation fails after an earlier success:** the old brief stays (AC-7).
- **Several agents reviewed the PR:** only the newest review of kind `review` counts, whichever agent wrote it. Its dismissed findings are not sent. Summary-kind rows are ignored (AC-19/AC-20/AC-32).
- **Transport retries:** the model adapter may re-send the *identical* request after a transport failure that returned no completion (network error, 429, 5xx). This is still the one model call of AC-3, logged once (AC-9). What is never allowed is a second request with different content, such as a schema re-ask or a correction prompt, or accepting more than one completion per generation.
- **No enabled agents, or none with attached documents:** "attached specs" is recorded as missing.
- **A stored brief written under an older contract shape that no longer parses:** it is treated as no brief, so Generate is shown.

## Non-functional requirements

- **Cost:** one model call per explicit generation, at most 8,000 input tokens, including the structured-output schema reserve (AC-11). Nothing calls the model on page load or on a new commit.
- **Latency:** a cached brief is part of the Overview's normal load, with no extra wait for the model. A generation is bounded by the model adapter's existing timeout and reasoning caps.
- **Observability:** each generation leaves one structured server log line `brief: <provider>/<model> tokens <in>/<out> cost <usd> duration_ms <d>` (AC-9), with no content.
- **Security:** generation is a paid side effect behind an unauthenticated API that is reachable from the LAN. AC-5 and AC-43 limit it to explicit requests, one at a time per PR. Model output never becomes markup (AC-31).
- **Accessibility:** focus items and risk file links are keyboard-reachable controls. Severity is not conveyed by colour alone: the icon shape differs by severity, or the item carries an accessible label.

## Inputs and provenance

- PR title, author, branch, head SHA, file list with additions and deletions — [reused: `GET /pulls/:id`, `PrFile` contract]
- Changed-line ranges per file, taken only from hunk headers `@@ -a,b +c,d @@` — [deterministic: `PrFile.patch` headers; bodies discarded] [user: answer to B1, 2026-10-06]
- Smart Diff role groups (core / tests / wiring / docs / boilerplate) per file — [reused: [007 — Smart Diff](007-smart-diff.md), `GET /pulls/:id/smart-diff`]
- Blast radius: changed symbols, callers with `file:line`, affected endpoints and crons, degradation flag and reason — [reused: [plan 18](../docs/plans/18-blast-radius.md), `GET /pulls/:id/blast`]. Changed symbols, endpoints and crons are capped when collected (AC-44). Callers and then changed symbols are trimmable under the budget (AC-12). Any cut is recorded as `truncated: blast_radius`. [user: cross-model review X3, 2026-10-06]
- Token budget: 8,000 input tokens counted with the server tokenizer, covering the system prompt, the facts and a fixed structured-output schema reserve that is subtracted before facts are fitted — [deterministic: server tokenizer adapter] [user: cross-model review X11, 2026-10-06]
- Stored intent (intent, in scope, out of scope, confidence, stale flag) — [llm: stored `review_intent` classification, [006 — Intent layer](006-intent-layer.md)]
- Latest review's non-dismissed findings (newest review of kind `review`, any agent): file, line, severity, title — [llm: stored review findings] [user: answer to B2, 2026-10-06]
- That same review's verdict and score (display only, not sent to the model) — [llm: stored review]
- PR description — [user: PR author, via the forge]
- Linked issue title and body — [external: forge issue API, resolved as in spec 006]
- Attached specs: the deduplicated Project Context documents attached to the workspace's enabled agents, directly or through their enabled skills — [reused: [008 — Project Context](008-project-context.md)], with content from the repo clone, treated as `[user: repository authors]` [user: answer to B5, 2026-10-06]
- Model selection — [reused: `risk_brief` feature model, Settings]
- Brief output (summary, risks, review focus) — [llm: one `risk_brief` structured call]

## Untrusted inputs

All of the following are data, never instructions, both to the model and to the UI:

- Stored intent text (`llm`).
- Review findings' titles, and the verdict and score (`llm`).
- The model's own brief output: summary, risk titles and explanations, focus reasons, and the paths and lines it names (`llm`). Paths and lines are re-validated (AC-23/AC-24), and text is rendered without images or HTML (AC-31).
- PR title and description (`user`).
- Attached Project Context documents, which are cloned-repository content (`user`).
- Linked issue title and body (`external`).
- File paths and hunk headers from the PR diff, which are cloned or forge content.

## Module interactions

- **`@devdigest/shared` (`contracts/brief.ts`, server copy first, client copy mirrored):** `PrBrief` becomes `{ summary, risks, review_focus: [{ file, line, reason }], missing_inputs[], head_sha, generated_at, model }`. `intent`, `blast` and `history` become optional or nullable. The existing `Risk`/`Risks` shapes are kept. The model's structured-output schema is a contract that the call is validated against. Trims (AC-13) are recorded in the brief. [user: answer to B4, 2026-10-06]
- **server, new brief API:** `GET /pulls/:id/brief` returns the stored brief plus its staleness against the PR's current head SHA, with no model call. `POST /pulls/:id/brief` generates or regenerates it. The brief is stored in the existing `pr_brief {pr_id, json}` table.
- **server, reads:** pulls (PR row, files, patches), the stored intent (intent module / `pr_intent`), blast radius (blast module), Smart Diff grouping, the newest review of kind `review` and its non-dismissed findings (reviews), Project Context documents attached to enabled agents and skills (spec 008), the linked issue through the forge port, the `risk_brief` model through Settings feature models, the tokenizer adapter for the budget, and the LLM port's structured completion.
- **client:** the Overview tab gets the PR Brief block: verdict banner, summary, Risk areas, Review focus, missing/stale/truncated notes, and Generate/Refresh. It keeps using the existing Intent and Blast radius cards and the existing review data for the verdict banner. The Files changed tab accepts a target file and line from the Overview and scrolls there. Labels live in `messages/en/brief.json`.
- **reviewer-core:** no change expected.
- **mcp-server:** no change (Non-goal).

## Open questions

None.

## Changelog

2026-10-06 · all · approved (B1–B8 recommended options) · user approval after pass 2 · user
2026-10-06 · AC-3, AC-7, AC-9, AC-19, AC-20, AC-32, AC-33, Edge cases, NFR Observability, Inputs, Module interactions · no schema re-ask (transport retries of the identical request allowed); one pino log line per generation; latest review = newest kind=review row, non-dismissed findings · plan 28 GAP1–3 (REC1–3) · user
2026-10-06 · AC-11, AC-12, AC-35, AC-44 (new), AC-45 (new), Edge cases, NFR Cost, Inputs and provenance · schema reserve inside the 8,000-token budget; blast arrays capped, changed symbols trimmed after callers; over-budget is its own failure; verdict banner keeps review labels · plan 28 cross-model review X3/X7/X11 · user
