# docs/ — repo-wide deep documentation

Index of cross-package documentation. `CLAUDE.md` links here instead of inlining
this content, so an agent reads only what a given task needs.

**Keep this index current.** One line per document, enough to decide whether to
open it. A doc nobody can find from here is a doc nobody reads.

| Document | Read it when |
|----------|--------------|
| [`agent-prompts/`](agent-prompts/README.md) | Writing or changing a reviewer agent's `system_prompt` — assembly, the injection guard, scoring conventions |
| [`agent-prompts/choosing-a-model.md`](agent-prompts/choosing-a-model.md) | Picking a model for an agent or a feature slot |

## What belongs here

Stable explanations with a longer shelf life than a single change: architecture
decisions, runbooks, subsystem deep-dives, conventions that need more than a
line to justify.

## What does not

- **Package-local material** → that package's `docs/`.
- **Anything an agent must know every session** → the relevant `CLAUDE.md`,
  compressed to a line.
- **A record of one incident** → `INSIGHTS.md`.
- **Work not yet built** → `specs/`.
