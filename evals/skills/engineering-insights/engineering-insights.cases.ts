import { fixtureReader, type SkillCase } from "../../src/index.js";

// Content tier: the skill text alone, no tools (run-claude.ts). The wrap-up cannot read or write
// files here, so each raw session transcript ends with the current headings of its target files
// and the model is asked to reply with what it WOULD append. Fixtures are raw — commands, output,
// edits — with no conclusion; the answer is not in them.
const fx = fixtureReader(import.meta.url);

const wrapUp = (session: string) =>
  `The session below has ended. Run your wrap-up. You cannot write files: reply with exactly what you would append and where (file, section), and the gotchas change, or say why nothing is written.\n\n${session}`;

export const cases: SkillCase[] = [
  {
    name: "writes nothing for a session with no non-obvious finding",
    kind: "quality",
    prompt: wrapUp(fx("session-rename-only.md")),
    practices: [
      "states that no entry is written (for example 'no new insight') and proposes no INSIGHTS.md entry",
      "does not propose a Session Note that only restates the rename",
    ],
    threshold: 1.0,
    maxTurns: 4,
  },
  {
    name: "records a real server finding with Symptom/Cause/Rule/Evidence in server/INSIGHTS.md",
    kind: "quality",
    prompt: wrapUp(fx("session-server-finding.md")),
    practices: [
      "routes the entry to server/INSIGHTS.md (not the root INSIGHTS.md and not client/INSIGHTS.md)",
      "puts the entry under one of the seven sections (What Works, What Doesn't Work, Codebase Patterns, Tool & Library Notes, Recurring Errors & Fixes, Session Notes, Open Questions)",
      "the entry has **Symptom:**, **Cause:**, **Rule:** and **Evidence:** lines",
      "the Evidence line cites a path:line or the error string from the transcript",
      "the Rule says what to do from now on (an actionable instruction), not 'be careful'",
      "proposes the matching item in server/insights/gotchas.md (Step 5b) linking to the new entry",
    ],
    threshold: 0.8,
    maxTurns: 4,
  },
];
