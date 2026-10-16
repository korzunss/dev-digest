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
 *   .claude/agents/*.md, evals/workflow/**, evals/src/ (except its *.test.ts files),
 *   or a touched .claude/skills/<name>/ whose name is a token in evals/workflow/*.cases.ts
 *   (evals/skills/<name>/ changes do not trigger it).
 *
 * $CI_DETECT_TIER=skills|agents|workflow restricts the run to one tier (the other tiers' outputs
 * are empty: [], false, ""); unset or empty = all tiers. Any other value exits with status 2.
 *
 * A CI-engine change (D5) runs EVERY suite with evals of the tiers it concerns (workflow tier:
 * run_workflow=true) and logs an "engine-change:" line per matched category:
 *   .github/workflows/harness-evals-<tier>.yml            → that tier only
 *   evals/scripts/**, evals/package.json, evals/pnpm-lock.yaml,
 *   .github/actions/harness-evals-setup/**, -detect/**    → all three tiers
 *   evals/proxy/**                                        → agents and workflow
 *
 * $CI_DETECT_ALL=1|true ignores $CHANGED_FILES and selects every suite that has evals.
 * Paths under server/clones/ or node_modules/ are dropped before matching.
 *
 * A changed artifact with NO written evals is NOT a failure: it prints
 * "SKIP <tier> <name> (no evals)" plus a ::notice annotation. Exit code is 0 (2 for a bad $CI_DETECT_TIER).
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

// Tier selector: unset/empty = all tiers. The value is matched against a fixed list only.
const TIERS = ["skills", "agents", "workflow"];
const tierEnv = (process.env.CI_DETECT_TIER ?? "").trim();
if (tierEnv !== "" && !TIERS.includes(tierEnv)) {
  console.error("error: CI_DETECT_TIER must be skills, agents or workflow");
  process.exit(2);
}
const sel = Object.fromEntries(TIERS.map((t) => [t, tierEnv === "" || tierEnv === t]));

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
/** Token match: `security` does not match `security-reviewer`; `/sdd-engineering` matches `sdd-engineering`. */
const mentioned = (name) =>
  new RegExp(`(^|[^A-Za-z0-9_-])${escapeRe(name)}($|[^A-Za-z0-9_-])`).test(casesText);

let skills = [];
let agents = [];
let skippedSkills = [];
let skippedAgents = [];
let runWorkflow = false;
let engineMode = false;
const info = [];

if (allMode) {
  if (sel.skills) skills = allWithEvals("skills");
  if (sel.agents) agents = allWithEvals("agents");
  runWorkflow = sel.workflow;
} else {
  const skillNames = touched(/^\.claude\/skills\/([^/]+)\//, /^evals\/skills\/([^/]+)\//);
  // README.md is the agents index, not an agent.
  const agentNames = touched(
    /^\.claude\/agents\/(?!README\.md$)([^/]+)\.md$/,
    /^evals\/agents\/([^/]+)\//,
  );

  // D5: a change to the CI engine itself must exercise every suite of the tiers it concerns.
  // Labels are fixed strings; each category names the tiers it re-runs.
  const ALL_TIERS = ["skills", "agents", "workflow"];
  const engineCategories = [
    [".github/workflows/harness-evals-skills.yml", ["skills"], (f) => f === ".github/workflows/harness-evals-skills.yml"],
    [".github/workflows/harness-evals-agents.yml", ["agents"], (f) => f === ".github/workflows/harness-evals-agents.yml"],
    [".github/workflows/harness-evals-workflow.yml", ["workflow"], (f) => f === ".github/workflows/harness-evals-workflow.yml"],
    ["evals/scripts/**", ALL_TIERS, (f) => f.startsWith("evals/scripts/")],
    ["evals/proxy/**", ["agents", "workflow"], (f) => f.startsWith("evals/proxy/")],
    ["evals/package.json", ALL_TIERS, (f) => f === "evals/package.json"],
    ["evals/pnpm-lock.yaml", ALL_TIERS, (f) => f === "evals/pnpm-lock.yaml"],
    [".github/actions/harness-evals-setup/**", ALL_TIERS, (f) => f.startsWith(".github/actions/harness-evals-setup/")],
    [".github/actions/harness-evals-detect/**", ALL_TIERS, (f) => f.startsWith(".github/actions/harness-evals-detect/")],
  ];
  const engine = { skills: false, agents: false, workflow: false };
  for (const [label, tiers, test] of engineCategories) {
    const hit = tiers.filter((t) => sel[t]);
    if (hit.length > 0 && changed.some(test)) {
      for (const t of hit) engine[t] = true;
      engineMode = true;
      info.push(`engine-change: ${label} → running every suite with evals (D5)`);
    }
  }

  if (sel.skills) {
    skills = engine.skills
      ? allWithEvals("skills")
      : skillNames.filter((n) => hasEvals("skills", n));
    skippedSkills = skillNames.filter((n) => !hasEvals("skills", n));
  }
  if (sel.agents) {
    agents = engine.agents
      ? allWithEvals("agents")
      : agentNames.filter((n) => hasEvals("agents", n));
    skippedAgents = agentNames.filter((n) => !hasEvals("agents", n));
  }

  if (sel.workflow) {
    // Only the live harness (.claude/skills/<n>/) counts; evals/skills/<n>/ is eval code.
    const claudeSkillNames = touched(/^\.claude\/skills\/([^/]+)\//, /(?!)/);
    const skillTriggers = claudeSkillNames.filter(mentioned);
    for (const n of claudeSkillNames.filter((n) => !mentioned(n) && hasEvals("skills", n))) {
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
      (/^evals\/src\//.test(f) && !/^evals\/src\/.*\.test\.ts$/.test(f));

    runWorkflow = engine.workflow || changed.some(harnessFile) || skillTriggers.length > 0;
  }
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
console.error(`mode          : ${allMode ? "all" : engineMode ? "engine" : "changed"}`);
console.error(`tier          : ${tierEnv || "all"}`);
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
