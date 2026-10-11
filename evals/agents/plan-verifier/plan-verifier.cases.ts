import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// The plan is read by path (the agent refuses a pasted plan); the patch is inline because it is
// not applied to the working tree and Bash is stripped by agentTask.
const verifyPrompt = (diff: string) => `Plan: evals/agents/plan-verifier/fixtures/redact-clone-url.plan.md (Status approved; read it from that path). It is a committed eval fixture, not an untracked plan.

Diff source: the patch below. It is given inline and is NOT applied to the working tree: verify against the patch, and read repo files only as context.
Bash is not available, so no check can be re-run, and no full integration run was provided.

${fx(diff)}`;

export const cases: AgentCase[] = [
  {
    name: "finds the unredacted token against AC1 and cites the line",
    kind: "quality",
    prompt: verifyPrompt("redact-clone-url-defect.diff"),
    practices: [
      "marks AC1 (or S1) as partial, missing or contradicted, and never as met",
      "cites the line of the patch in server/src/modules/repos/helpers.ts that clears only the username and leaves the password in place, as a `path:line`",
      "lists a gap that the implementer can close in fix mode",
      "the Result is incomplete or contradicted",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "does not fabricate a gap for a complete patch",
    kind: "quality",
    prompt: verifyPrompt("redact-clone-url-clean.diff"),
    practices: [
      "no item is marked partial, missing or contradicted",
      "the Done-when commands (typecheck and the unit test) are reported as not-verifiable, not as missing",
      "the Result is `complete — needs sign-off`",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
