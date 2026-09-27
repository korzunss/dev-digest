# LLM pipeline — the seven controls (X5, X6)

The review pipeline feeds untrusted diffs, PR text and repo content to an
LLM and renders its findings back to the user. `reviewer-core` stays pure
(no I/O beyond the injected `LLMProvider`), so these controls live in prompt
assembly and output handling, not in a sandboxed runtime.

## Contents
- The seven controls
- Prompt injection stays in scope

## The seven controls
Check each one whenever `reviewer-core/**` or an LLM output consumer is in
scope. A change that weakens any of these is X5 (input side) or X6 (output
side).

OWASP Top 10 for LLM Applications 2025, per control:
controls 1–2 → [LLM01 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) ·
controls 3–5 → [LLM05 Improper Output Handling](https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/) ·
control 6 → [LLM06 Excessive Agency](https://genai.owasp.org/llmrisk/llm06-sensitive-information-disclosure/) (legacy slug, LLM06 content) ·
control 7 → [LLM02 Sensitive Information Disclosure](https://genai.owasp.org/llmrisk/llm02-insecure-output-handling/) (legacy slug, LLM02 content).

1. **PR-sourced fields are wrapped before concatenation.** Every
   repo-/PR-derived string reaching a prompt goes through `wrapUntrusted()`
   (`reviewer-core/src/prompt.ts:30-34`), not string-concatenated in raw.
   Call sites: the PR description (`:152`), derived intent (`:156`), the repo
   skeleton (`:162`), callers of changed symbols (`:167`), the diff itself
   (`:170`). A new untrusted input added to `assemblePrompt` without a
   matching `wrapUntrusted()` call is the finding.
2. **The closing delimiter is escaped.** `wrapUntrusted()` replaces any
   `</untrusted>` inside the content before wrapping it
   (`reviewer-core/src/prompt.ts:32`), so untrusted content cannot forge a
   closing tag and inject text the model reads as system-level framing.
3. **LLM output is schema-validated before use**, not parsed from
   free-form text. The provider call sets `response_format: { type:
   'json_schema', strict: true }` (`reviewer-core/src/llm/openrouter.ts:77-79`)
   against the `Review`/finding Zod contract, so a reply that doesn't match
   the schema is rejected at the provider boundary rather than trusted.
4. **No raw-HTML rendering of an LLM field.** A finding's `issue`/`fix`
   text (or any other model-authored string) reaching a client component
   must go through normal JSX text rendering, never
   `dangerouslySetInnerHTML`. Check any client change that renders a
   finding or review field.
5. **No LLM output in shell/git/SQL.** A finding's file path, line range or
   text must never be interpolated into a subprocess argv, a git ref, or a
   raw SQL fragment. `groundFindings()` (`reviewer-core/src/grounding.ts`)
   only ever intersects a finding's claimed range against real diff hunks —
   it does not execute or re-fetch content named by the model.
6. **No auto-action without a human gate.** The engine never edits code,
   merges, or pushes on the model's say-so: `verdict` only ever becomes a
   review comment plus, per agent, a CI block decided by
   `agents.ciFailOn` (`server/src/db/schema/agents.ts:34`) — a
   config value the user sets, not something the model can raise on its
   own. A change that lets a model-controlled field trigger a side effect
   beyond posting a review is the finding.
7. **Guard/system text is not echoed to the UI.** `INJECTION_GUARD`
   (`reviewer-core/src/prompt.ts:16-28`) is appended to the **system**
   message only (`:129`) and is never part of a rendered review, log line
   shown to the user, or API response. A change that surfaces the system
   prompt or the guard text to an end user is the finding.

## Prompt injection stays in scope
Unlike Anthropic's generic `claude-code-security-review` (which excludes AI
prompt injection as a finding — see
[never-report.md](never-report.md)), prompt injection is **deliberately not
excluded here**: the LLM pipeline is this repo's product, and a broken or
bypassed injection control is a real, reportable defect (X5/X6), at
CRITICAL or HIGH per the agent's severity rules.
