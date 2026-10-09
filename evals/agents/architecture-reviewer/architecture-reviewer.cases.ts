import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// The agent's Step 0 builds its diff from git. In an eval the patch is not in the working tree
// (and Bash is stripped), so the prompt hands it over inline and says so — otherwise the agent
// answers `Status: blocked` on an empty `git diff`. Same wording for every case and both variants.
const reviewPrompt = (fixture: string) => `Review mode: diff. Plan: none.

The change under review is the patch below. It is given inline and is NOT applied to the working
tree, so review the patch itself; read the repo's docs, skills and code only as rule sources.

${fx(fixture)}`;

// Shared across the strict (architecture-reviewer) and relaxed (architecture-reviewer-lite)
// variants so both agents are graded on the exact same task, fixture and prompt — the only thing
// that should move between the two runs is the rule-citation practices. Rule ids below are the
// agent's own check ids (A1…A13 in its *Checks* table) with their documented sources.
export const cases: AgentCase[] = [
  {
    name: "flags both checkout violations with severity and a documented rule",
    kind: "quality",
    prompt: reviewPrompt("checkout-service.diff"),
    practices: [
      // detection
      "reports a finding that the domain file server/src/modules/checkout/domain/checkout.ts imports `FastifyReply` from 'fastify' (a transport/framework type pulled into the domain layer, so a dependency points outward)",
      "reports a finding that server/src/modules/checkout/service.ts constructs the repository with `new PgCheckoutRepository()` itself instead of receiving it from the DI container (platform/container.ts)",
      // severity
      "gives each of the two findings an explicit severity from the CRITICAL / HIGH / MEDIUM scale",
      "rates neither of the two findings below HIGH (both are boundary violations, not naming or placement nits)",
      // documented rule
      "for the FastifyReply import, names a concrete documented rule: the onion dependency rule (check A1, or the A2-style core-purity check) together with its source document (onion-architecture skill / layer map, or server/docs/architecture.md) — not only a prose description",
      "for the `new PgCheckoutRepository()` call, names a concrete documented rule: adapters only via DI (check A5, or A1) together with its source document (server/AGENTS.md, onion-architecture skill, or platform/container.ts as the composition root) — not only a prose description",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "does not fabricate an architecture finding for the out-of-scope security-shaped change",
    kind: "quality",
    prompt: reviewPrompt("checkout-service.diff"),
    practices: [
      "reports the `reply?: FastifyReply` parameter, if at all, only as part of the layering/dependency-rule issue (A1) — not as a separate runtime, security or API-design finding",
      "stays scoped to structural/layering/DI findings and does not comment on naming, style or test coverage",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "cites the documented rule for reviewer-core violations",
    kind: "quality",
    prompt: reviewPrompt("reviewer-core-gate.diff"),
    practices: [
      "flags the `import { readFileSync } from 'node:fs'` (and the readFileSync call) added to reviewer-core/src/review/run.ts as a violation (reviewer-core must do no I/O except the injected LLMProvider)",
      "flags that `finalFindings` now starts from `merged.findings` instead of `ground.kept`, so findings that `groundFindings()` dropped still reach the review — the grounding gate is bypassed",
      "names the documented rule for the fs-import finding: reviewer-core purity (check A2) with its source (CLAUDE.md, reviewer-core/AGENTS.md or reviewer-core/docs/pipeline.md) — not only a prose description",
      "names the documented rule for the skipped-gate finding: the grounding gate (check A11) with its source (reviewer-core/AGENTS.md, reviewer-core/docs/pipeline.md or reviewer-core/INSIGHTS.md) — not only a prose description",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "ends with an explicit PASS/BLOCK verdict",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "does not fabricate a documented-rule violation for a benign rename",
    kind: "quality",
    prompt: reviewPrompt("benign-refactor.diff"),
    practices: [
      "reports no CRITICAL, HIGH or MEDIUM finding for the benign local-variable rename",
      "does not fabricate a rule violation where the diff violates none of the checked rules",
      "the final verdict is PASS",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
