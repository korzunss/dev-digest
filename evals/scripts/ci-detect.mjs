/**
 * CI change detector for the harness evals.
 *
 * Reads a newline-separated list of changed files (repo-relative) from $CHANGED_FILES and maps
 * them onto the eval suites that should run for this PR:
 *
 *   .claude/skills/<name>/**   OR  evals/skills/<name>/**   → run evals/skills/<name>  (content tier)
 *   .claude/agents/<name>.md   OR  evals/agents/<name>/**   → run evals/agents/<name>  (tool tier)
 *
 * The workflow tier measures the LIVE harness and runs when any of these change:
 *   CLAUDE.md, AGENTS.md, .claude/CLAUDE.md, .claude/settings.json,
 *   nested <dir>/AGENTS.md, <dir>/CLAUDE.md, <dir>/insights/gotchas.md (outside .claude/),
 *   .claude/agents/*.md, evals/workflow/**, evals/src/**,
 *   or a touched skill whose name is a token in evals/workflow/*.cases.ts.
 *
 * $CI_DETECT_ALL=1|true ignores $CHANGED_FILES and selects every suite that has evals.
 * Paths under server/clones/ or node_modules/ are dropped before matching.
 *
 * A changed artifact with NO written evals is NOT a failure: it prints
 * "SKIP <tier> <name> (no evals)" plus a ::notice annotation. Exit code is always 0.
 *
 * Emits step outputs (skills, agents, run_workflow, skipped_skills, skipped_agents, has_suites)
 * to $GITHUB_OUTPUT, or to stdout when it is unset. Pure filesystem + string work — no deps.
 * Names come from PR-controlled paths: only /^[A-Za-z0-9._-]+$/ names are ever emitted.
 */

import { existsSync, readdirSync, readFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

const allMode = ["1", "true"].includes((process.env.CI_DETECT_ALL ?? "").trim());

const changed = allMode
  ? []
  : (process.env.CHANGED_FILES ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((f) => !f.startsWith("server/clones/") && !f.includes("/node_modules/"));

/** Does evals/<tier>/<name>/ contain at least one *.eval.ts? */
function hasEvals(tier, name) {
  const dir = join(EVALS_DIR, tier, name);
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((f) => f.endsWith(".eval.ts"));
}

/** Every directory name under evals/<tier>/ that has evals. */
function allWithEvals(tier) {
  const dir = join(EVALS_DIR, tier);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && SAFE_NAME.test(d.name) && hasEvals(tier, d.name))
    .map((d) => d.name)
    .sort();
}

/** Collect distinct artifact names touched under a `.claude` and/or `evals` prefix. */
function touched(reClaude, reEvals) {
  const names = new Set();
  for (const f of changed) {
    const m = f.match(reClaude) ?? f.match(reEvals);
    if (!m) continue;
    if (!SAFE_NAME.test(m[1])) {
      console.error("warning: ignoring a path whose artifact name has unsafe characters");
      continue;
    }
    names.add(m[1]);
  }
  return [...names].sort();
}

/** Text of every evals/workflow/*.cases.ts, read once. */
function workflowCasesText() {
  const dir = join(EVALS_DIR, "workflow");
  if (!existsSync(dir)) return "";
  return readdirSync(dir)
    .filter((f) => f.endsWith(".cases.ts"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const casesText = workflowCasesText();
/** Token match: `security` does not match `security-reviewer`; `/sdd` matches `sdd`. */
const mentioned = (name) =>
  new RegExp(`(^|[^A-Za-z0-9_-])${escapeRe(name)}($|[^A-Za-z0-9_-])`).test(casesText);

let skills;
let agents;
let skippedSkills = [];
let skippedAgents = [];
let runWorkflow;
const info = [];

if (allMode) {
  skills = allWithEvals("skills");
  agents = allWithEvals("agents");
  runWorkflow = true;
} else {
  const skillNames = touched(/^\.claude\/skills\/([^/]+)\//, /^evals\/skills\/([^/]+)\//);
  // README.md is the agents index, not an agent.
  const agentNames = touched(
    /^\.claude\/agents\/(?!README\.md$)([^/]+)\.md$/,
    /^evals\/agents\/([^/]+)\//,
  );

  skills = skillNames.filter((n) => hasEvals("skills", n));
  skippedSkills = skillNames.filter((n) => !hasEvals("skills", n));
  agents = agentNames.filter((n) => hasEvals("agents", n));
  skippedAgents = agentNames.filter((n) => !hasEvals("agents", n));

  const skillTriggers = skillNames.filter(mentioned);
  for (const n of skillNames.filter((n) => !mentioned(n) && hasEvals("skills", n))) {
    info.push(
      `workflow tier: skill ${n} not referenced in evals/workflow/*.cases.ts — not triggered`,
    );
  }

  const harnessFile = (f) =>
    f === "CLAUDE.md" ||
    f === "AGENTS.md" ||
    f === ".claude/CLAUDE.md" ||
    f === ".claude/settings.json" ||
    (!f.startsWith(".claude/") && /(^|\/)(AGENTS\.md|CLAUDE\.md|insights\/gotchas\.md)$/.test(f)) ||
    /^\.claude\/agents\/.+\.md$/.test(f) ||
    /^evals\/workflow\//.test(f) ||
    /^evals\/src\//.test(f);

  runWorkflow = changed.some(harnessFile) || skillTriggers.length > 0;
}

const hasSuites = skills.length > 0 || agents.length > 0 || runWorkflow;

const out = process.env.GITHUB_OUTPUT;
const write = (k, v) => (out ? appendFileSync(out, `${k}=${v}\n`) : console.log(`${k}=${v}`));

write("skills", JSON.stringify(skills));
write("agents", JSON.stringify(agents));
write("run_workflow", String(runWorkflow));
write("skipped_skills", skippedSkills.join(" "));
write("skipped_agents", skippedAgents.join(" "));
write("has_suites", String(hasSuites));

// Human-readable summary in the step log.
console.error("── eval change detection ──");
console.error(`mode          : ${allMode ? "all" : "changed"}`);
console.error(`changed files : ${changed.length}`);
console.error(`skills → run  : ${skills.join(", ") || "(none)"}`);
console.error(`agents → run  : ${agents.join(", ") || "(none)"}`);
console.error(`workflow tier : ${runWorkflow ? "run" : "skip"}`);
for (const line of info) console.log(line);
for (const n of skippedSkills) {
  console.log(`SKIP skills ${n} (no evals)`);
  console.log(`::notice title=harness evals::SKIP skills ${n} (no evals)`);
}
for (const n of skippedAgents) {
  console.log(`SKIP agents ${n} (no evals)`);
  console.log(`::notice title=harness evals::SKIP agents ${n} (no evals)`);
}
