import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { SKILLS_DIR, type SkillCase } from "../../src/index.js";

// Content tier: skillTask injects SKILL.md (+ references/*.md, which this skill has none of) with
// NO tools, so the skill cannot run git, typecheck or tests, and cannot Read its own companion
// files. Each case therefore inlines what the skill would have in hand at step 3:
//   - gates.md: the changed-file list, the deterministic-gate exit codes + logs and, when the
//     diff was fanned out, the analyzer subagents' raw findings;
//   - files/: the changed files post-change, each line marked `+` (added/modified) or ` `;
//   - gate.md + routing.md, read live from .claude/skills/pr-self-review/, because skillContent()
//     only loads references/*.md (plan 32 TQ1) and the closed CRITICAL catalog lives in gate.md.
//     Reading them live keeps a change to gate.md visible to the eval.
// The suite tests the gate's DECISION logic: fail-fast, the closed catalog, adversarial
// verification + downgrade, same-line suppression. Hard facts are grounding (substring) checks on
// the fenced `gate` block; the judge scores the rest.

const FX = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const SKILL_DIR = join(SKILLS_DIR, "pr-self-review");

function listFiles(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? listFiles(p) : [p];
    });
}

/** One `=== path ===` header per changed file, each line as `<n>: <marker><code>`. */
function changedFiles(caseDir: string): string {
  const root = join(FX, caseDir, "files");
  return listFiles(root)
    .map((f) => {
      const body = readFileSync(f, "utf8")
        .replace(/\n$/, "")
        .split("\n")
        .map((l, i) => `${i + 1}: ${l}`)
        .join("\n");
      return `=== ${relative(root, f)} ===\n${body}`;
    })
    .join("\n\n");
}

const companion = (name: string) =>
  `=== .claude/skills/pr-self-review/${name} ===\n${readFileSync(join(SKILL_DIR, name), "utf8")}`;

const OUTPUT_CONTRACT = `Print the report the skill's step 5 describes, then end your reply with one fenced block tagged \`gate\`, in exactly this shape (one finding per line, \`file\` as the repo-relative path shown in the \`===\` headers or the findings, \`line\` as the new-file line number):

\`\`\`gate
verdict: <PASS or BLOCKED>
failed_gate: <package + gate name of the first failing deterministic gate, or none>
critical: <file>:<line> — <issue> — <fix>
downgraded: <file>:<line> — <why it does not block>
warning: <file>:<line> — <HIGH or MEDIUM> — <issue>
suppressed: <file>:<line> — <reason from the comment>
counts: critical=<n> high=<n> medium=<n> suppressed=<n>
\`\`\`

Repeat a \`critical\` / \`downgraded\` / \`warning\` / \`suppressed\` line per finding; write \`<key>: none\` when a list is empty.`;

function prompt(caseDir: string): string {
  return `Run the pr-self-review gate on my branch before I push.

You have no tools. Steps 1–2 (diff scope, deterministic gates) and, where the diff was fanned out, step 3's analyzer output were already produced; they are pasted below. The skill's companion files are inlined as you would read them. Do the remaining steps yourself, inline, from what is shown; do not ask for more data and do not write \`.pr-self-review.json\`. Changed files are shown post-change: each line is \`<n>: \` (its line number in the new file) followed by \`+\` for an added/modified line or a space for an unchanged one.

${OUTPUT_CONTRACT}

## Steps 1–3 so far

${readFileSync(join(FX, caseDir, "gates.md"), "utf8")}

## Changed files

${changedFiles(caseDir)}

## Companion files

${companion("gate.md")}

${companion("routing.md")}`;
}

export const cases: SkillCase[] = [
  {
    name: "case-1 typecheck fails: BLOCKED on the deterministic gate, no LLM pass",
    kind: "quality",
    prompt: prompt("case-1-typecheck-fails"),
    grounding: ["verdict: BLOCKED", "typecheck"],
    practices: [
      "the `gate` block names the server typecheck as the failing gate (failed_gate mentions server and typecheck), and the reply cites the type error at service.ts line 17",
      "the reply says the LLM review passes (routing / analyzer / skill review) were skipped because a deterministic gate failed, rather than reviewing the code",
      "the reply does not report the unvalidated `req.body as { title: string }` in routes.ts (or any other code-review finding) as a finding: no critical/downgraded/warning line names routes.ts",
      "the reply does not claim the test gate passed or ran, and does not ask for tests to be run before deciding the verdict",
      "the reply mentions the PR_SELF_REVIEW_OVERRIDE escape hatch (or `git push --no-verify`) for the BLOCKED verdict",
    ],
    threshold: 0.8,
    maxTurns: 4,
  },
  {
    name: "case-2 unvalidated route body: BLOCKED with the finding at routes.ts:24, legacy line untouched",
    kind: "quality",
    prompt: prompt("case-2-unvalidated-body"),
    grounding: ["verdict: BLOCKED", "failed_gate: none"],
    practices: [
      "the `gate` block has a `critical:` line for server/src/modules/digest/routes.ts at line 22, 23 or 24, saying the PUT /digest/:id/schedule body (`req.body as { cron; recipients }`) is used without Zod validation, with a fix that adds a body schema / Zod parse",
      "the reply treats that critical as verified by the adversarial (skeptic) pass, e.g. states it survived refutation because the body is external input with no `schema.body` and no parse",
      "the reply does not flag the unchanged DELETE route's `(req.params as { id: string })` cast at routes.ts line 18 as critical or as any finding (it is pre-existing code on an untouched line)",
      "every `critical:` line in the `gate` block names routes.ts; service.ts (the sequential `await` per recipient at lines 21–22) has no `critical:` line",
      "counts reports critical=1",
    ],
    threshold: 0.8,
    maxTurns: 4,
  },
  {
    name: "case-3 refuted and off-catalog CRITICALs: both downgraded to HIGH, verdict PASS",
    kind: "quality",
    prompt: prompt("case-3-downgrades"),
    grounding: ["verdict: PASS", "critical: none"],
    practices: [
      "the `gate` block has a `downgraded:` line for server/src/modules/digest/routes.ts:22 (the security 'no Zod parse' finding), saying it was refuted because the route declares `schema: { body: DigestScheduleInput }` under the Zod type provider, so the body is validated",
      "the reply reports the routes.ts:19 fastify 'no response schema' finding as HIGH (not blocking) because it is not in the closed CRITICAL catalog, listing it as downgraded or as a HIGH warning",
      "neither downgraded finding is dropped silently: both routes.ts:22 and routes.ts:19 appear in the reply's output, labeled as downgraded or HIGH",
      "the service.ts:18 HIGH and the ScheduleForm.tsx:12 MEDIUM are kept as warnings at their own severities",
      "counts reports critical=0",
    ],
    threshold: 0.8,
    maxTurns: 4,
  },
  {
    name: "case-4 same-line ignore suppresses the CRITICAL and is counted; the line-above ignore does not",
    kind: "quality",
    prompt: prompt("case-4-suppression"),
    grounding: ["verdict: PASS", "critical: none"],
    practices: [
      "the `gate` block has a `suppressed:` line for client/src/components/digest-panel/DigestPanel.tsx:9 that echoes the comment's reason (plan 41 / moving the count to the API)",
      "the DigestPanel.tsx:12 rowStyle finding is NOT suppressed, because its pr-self-review-ignore comment sits on line 11, not on the same line; it is still reported as a HIGH warning",
      "counts reports suppressed=1 (not 2) and critical=0",
      "the reply's summary states the number of suppressed findings (1), so the suppression stays visible",
    ],
    threshold: 0.75,
    maxTurns: 4,
  },
];
