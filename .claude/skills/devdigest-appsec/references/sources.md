# Sources

Retrieved 2026-09-27 by six parallel `researcher` runs for
`docs/plans/04-security-reviewer-agent.md`. Full tables with per-URL
takeaways and confidence are in that plan's *Sources* section — this file
lists what this skill relies on and the licence rule that shaped how it is
written.

## Contents
- OWASP / ASVS
- Localhost exposure
- OWASP LLM Top 10
- Prior art
- Skill layout and licences
- Licence rule

## OWASP / ASVS
- https://top10.owasp.org/2025/
- https://github.com/OWASP/ASVS/tree/v5.0.0/5.0/en
- https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x04-Assessment_and_Certification.md

## Localhost exposure
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS
- https://fastify.dev/docs/latest/Reference/ContentTypeParser/
- https://github.blog/security/application-security/localhost-dangers-cors-and-dns-rebinding/
- https://developer.chrome.com/blog/local-network-access
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

## OWASP LLM Top 10
- https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- https://genai.owasp.org/llmrisk/llm052025-improper-output-handling/
- https://genai.owasp.org/llmrisk/llm02-insecure-output-handling/ (legacy slug)
- https://genai.owasp.org/llmrisk/llm06-sensitive-information-disclosure/ (legacy slug)
- https://arxiv.org/abs/2403.14720 (spotlighting)
- https://www.microsoft.com/en-us/msrc/blog/2025/07/how-microsoft-defends-against-indirect-prompt-injection-attacks
- https://arxiv.org/abs/2404.13208 (instruction hierarchy)
- https://arxiv.org/abs/2505.18333 (adaptive-attack overstatement)

## Prior art
- https://raw.githubusercontent.com/anthropics/claude-code-security-review/main/README.md
- https://raw.githubusercontent.com/anthropics/claude-code-security-review/main/.claude/commands/security-review.md
- https://raw.githubusercontent.com/anthropics/claude-code-security-review/main/claudecode/prompts.py
- https://raw.githubusercontent.com/anthropics/claude-code-security-review/main/claudecode/findings_filter.py
- https://raw.githubusercontent.com/anthropics/claude-code-security-review/main/docs/custom-filtering-instructions.md
- https://support.claude.com/en/articles/11932705-automated-security-reviews-in-claude-code
- https://semgrep.dev/blog/2025/building-an-appsec-ai-that-security-researchers-agree-with-96-of-the-time/
- https://github.blog/news-insights/product-news/found-means-fixed-introducing-code-scanning-autofix-powered-by-github-copilot-and-codeql/

## Skill layout and licences
- https://github.com/trailofbits/skills (layout model: lean `SKILL.md` +
  `references/`, decision tree to references — structure/method only, used
  in our own words, see licence rule)
- https://raw.githubusercontent.com/trailofbits/skills/main/LICENSE (CC-BY-SA-4.0)
- https://raw.githubusercontent.com/anthropics/claude-code-security-review/main/LICENSE (MIT)
- https://github.com/anthropics/skills (SKILL.md format reference, no repo licence)
- https://raw.githubusercontent.com/OWASP/CheatSheetSeries/master/LICENSE.md (CC-BY-SA-4.0)
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- https://code.claude.com/docs/en/skills

## Licence rule
- **trailofbits/skills** (CC-BY-SA-4.0) — structure and method only, described
  in our own words here; no text copied.
- **OWASP Top 10:2025 / ASVS 5.0 / OWASP Cheat Sheet Series** (CC-BY-SA-4.0) —
  used only as short, paraphrased bullets with a link to the source; no
  verbatim passages, so this skill carries no ShareAlike notice. If stricter
  certainty on paraphrase reach is wanted, add a CC-BY-SA attribution block
  to `checks.md` (open question, see the plan's R12).
- **anthropics/claude-code-security-review** (MIT, © 2025 Anthropic) — its
  exclusion list is adapted with the licence notice kept, in
  [never-report.md](never-report.md) only, marked "modified".
- **anthropics/skills** — no repository licence; used for `SKILL.md` format
  conventions only (frontmatter shape, references-one-level-deep), not text.
