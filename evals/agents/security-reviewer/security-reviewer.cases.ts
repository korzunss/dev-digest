import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// The patch is not in the working tree (and Bash is stripped by agentTask), so the prompt hands it
// over inline and says so. The agent would otherwise stop on an empty `git diff`.
const reviewPrompt = (fixture: string) => `Mode: diff. Plan: none.

The change under review is the patch below. It is given inline and is NOT applied to the working
tree: review the patch itself, and read repo code only as context and to trace sinks.
Bash is not available: say so in *Checks not run* instead of stopping.

${fx(fixture)}`;

export const cases: AgentCase[] = [
  {
    name: "finds the unvalidated blame path reaching git argv",
    kind: "quality",
    prompt: reviewPrompt("repos-blame-route.diff"),
    practices: [
      "reports a finding (an SF id) on the new /repos/:id/blame route in server/src/modules/repos/routes.ts and gives it a `path:line`",
      "names the check X4 (untrusted value reaching git argv, no `--` separator) and/or X1 (no route Zod schema on the request) for that finding",
      "quotes the source (`req.query`) and the sink (`blame` or `--line-porcelain`) of the finding",
      "states a verdict, PASS or BLOCK, in the report header (the **Verdict:** line)",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "does not fabricate a finding for a local rename",
    kind: "quality",
    prompt: reviewPrompt("repos-routes-rename.diff"),
    practices: [
      "the Findings section is `None.` and no SF row is reported",
      "the verdict is PASS",
      "does not rate anything CRITICAL or HIGH anywhere in the report",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
