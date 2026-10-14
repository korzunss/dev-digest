/**
 * No-model tests for scripts/ci-detect.mjs: the tier selector, the engine table, D3, D4 SKIP.
 *   pnpm vitest run src/ci-detect.test.ts
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "ci-detect.mjs");

function detect(changed: string[], tier?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.GITHUB_OUTPUT;
  delete env.CI_DETECT_ALL;
  delete env.CI_DETECT_TIER;
  env.CHANGED_FILES = changed.join("\n");
  if (tier !== undefined) env.CI_DETECT_TIER = tier;
  const res = spawnSync(process.execPath, [SCRIPT], { env, encoding: "utf8" });
  const out: Record<string, string> = {};
  for (const line of res.stdout.split("\n")) {
    const m = line.match(/^([a-z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return { status: res.status, out };
}

const list = (v: string | undefined) => JSON.parse(v ?? "null") as string[];

describe("ci-detect", () => {
  test("unset tier: a skill with evals selects that skill", () => {
    const { out } = detect([".claude/skills/dependency-checker/SKILL.md"]);
    expect(list(out.skills)).toEqual(["dependency-checker"]);
    expect(out.run_workflow).toBe("false");
  });

  test("unset tier: a skill named in the workflow cases triggers the workflow tier (D3)", () => {
    const { out } = detect([".claude/skills/engineering-insights/SKILL.md"]);
    expect(out.run_workflow).toBe("true");
  });

  test("tier skills ignores an agent change", () => {
    const { out } = detect([".claude/agents/plan-verifier.md"], "skills");
    expect(list(out.agents)).toEqual([]);
    expect(list(out.skills)).toEqual([]);
    expect(out.run_workflow).toBe("false");
  });

  test("tier agents selects the agent and not the workflow", () => {
    const { out } = detect([".claude/agents/plan-verifier.md"], "agents");
    expect(list(out.agents)).toEqual(["plan-verifier"]);
    expect(out.run_workflow).toBe("false");
  });

  test("tier workflow runs for an agent file and selects no agents", () => {
    const { out } = detect([".claude/agents/plan-verifier.md"], "workflow");
    expect(out.run_workflow).toBe("true");
    expect(list(out.agents)).toEqual([]);
  });

  test("another tier's workflow file is not engine for this tier", () => {
    const { out } = detect([".github/workflows/harness-evals-agents.yml"], "skills");
    expect(list(out.skills)).toEqual([]);
  });

  test("evals/scripts is engine for every suite of the tier", () => {
    const { out } = detect(["evals/scripts/ci-detect.mjs"], "skills");
    expect(list(out.skills)).toContain("dependency-checker");
  });

  test("evals/proxy is engine for agents but not for skills", () => {
    const skills = detect(["evals/proxy/docker-compose.yml"], "skills");
    expect(list(skills.out.skills)).toEqual([]);
    const agents = detect(["evals/proxy/docker-compose.yml"], "agents");
    expect(list(agents.out.agents).length).toBeGreaterThan(0);
  });

  test("a skill without evals is skipped (D4)", () => {
    const { out } = detect([".claude/skills/zod/SKILL.md"], "skills");
    expect(out.skipped_skills).toBe("zod");
    expect(out.has_suites).toBe("false");
  });

  test("a bad tier exits with status 2", () => {
    expect(detect([], "bogus").status).toBe(2);
  });

  // an unknown tier value is rejected, never treated as "all" (case, list, path and wildcard forms)
  test.each(["Skills", "all", "skills,agents", "../workflow", "*"])(
    "invalid tier %j exits with status 2 and prints no outputs",
    (tier) => {
      const { status, out } = detect([".claude/skills/dependency-checker/SKILL.md"], tier);
      expect(status).toBe(2);
      expect(out).toEqual({});
    },
  );

  // surrounding whitespace is trimmed, an empty tier means all tiers
  test("a padded valid tier is accepted and an empty tier equals unset", () => {
    const files = [".claude/agents/plan-verifier.md"];
    expect(detect(files, " agents ").out).toEqual(detect(files, "agents").out);
    expect(detect(files, "").out).toEqual(detect(files).out);
  });

  // each tier's own workflow file re-runs every suite of that tier only
  test.each([
    ["skills", ".github/workflows/harness-evals-skills.yml", "skills"],
    ["agents", ".github/workflows/harness-evals-agents.yml", "agents"],
  ])("own workflow file for tier %s is engine for that tier", (tier, file, key) => {
    const { out } = detect([file], tier);
    expect(list(out[key]).length).toBeGreaterThan(0);
    expect(out.has_suites).toBe("true");
  });

  test("own workflow file for tier workflow sets run_workflow; another tier's file does not", () => {
    const wf = ".github/workflows/harness-evals-workflow.yml";
    expect(detect([wf], "workflow").out.run_workflow).toBe("true");
    expect(detect([wf], "skills").out.has_suites).toBe("false");
    expect(detect([wf], "agents").out.has_suites).toBe("false");
    expect(detect([".github/workflows/harness-evals-skills.yml"], "workflow").out.run_workflow).toBe("false");
  });

  // shared engine paths (setup action, package.json) reach all three tiers
  test.each([
    ".github/actions/harness-evals-setup/action.yml",
    ".github/actions/harness-evals-detect/action.yml",
    "evals/package.json",
    "evals/pnpm-lock.yaml",
  ])("shared engine path %s runs every tier", (file) => {
    expect(list(detect([file], "skills").out.skills).length).toBeGreaterThan(0);
    expect(list(detect([file], "agents").out.agents).length).toBeGreaterThan(0);
    expect(detect([file], "workflow").out.run_workflow).toBe("true");
  });

  // evals/proxy concerns agents and workflow, never skills
  test("evals/proxy runs workflow but not skills", () => {
    expect(detect(["evals/proxy/docker-compose.yml"], "workflow").out.run_workflow).toBe("true");
    expect(detect(["evals/proxy/docker-compose.yml"], "skills").out.has_suites).toBe("false");
  });

  // with the tier unset a skills-workflow change keeps today's all-tier shape: only skills run
  test("unset tier: the skills workflow file runs skills only", () => {
    const { out } = detect([".github/workflows/harness-evals-skills.yml"]);
    expect(list(out.skills).length).toBeGreaterThan(0);
    expect(list(out.agents)).toEqual([]);
    expect(out.run_workflow).toBe("false");
  });

  // unset tier is the union of the three single-tier runs
  test("unset tier output equals the union of the per-tier outputs", () => {
    const files = [
      ".claude/skills/dependency-checker/SKILL.md",
      ".claude/agents/plan-verifier.md",
      "AGENTS.md",
    ];
    const all = detect(files).out;
    expect(list(all.skills)).toEqual(list(detect(files, "skills").out.skills));
    expect(list(all.agents)).toEqual(list(detect(files, "agents").out.agents));
    expect(all.run_workflow).toBe(detect(files, "workflow").out.run_workflow);
    expect(list(all.skills)).toEqual(["dependency-checker"]);
    expect(list(all.agents)).toEqual(["plan-verifier"]);
    expect(all.run_workflow).toBe("true");
  });

  test("a name with an unsafe character is not emitted", () => {
    const { out } = detect([".claude/skills/bad name$/SKILL.md"]);
    expect(list(out.skills)).toEqual([]);
    expect(out.skipped_skills).toBe("");
  });

  // F1: only the live harness skill (.claude/skills) can trigger the workflow tier
  test("evals/skills/<n> change of a skill named in workflow cases does not trigger the workflow tier", () => {
    const { out } = detect(["evals/skills/engineering-insights/cases.ts"], "workflow");
    expect(out.run_workflow).toBe("false");
  });

  // F2: tests under evals/src are not a harness change
  test("evals/src test files do not trigger the workflow tier; other evals/src files do", () => {
    expect(detect(["evals/src/ci-detect.test.ts"], "workflow").out.run_workflow).toBe("false");
    expect(detect(["evals/src/judge.ts"], "workflow").out.run_workflow).toBe("true");
  });

  // F3: each tier workflow's on.pull_request.paths covers the shared engine paths
  test.each([
    ["skills", [".claude/skills/**", "evals/skills/**"]],
    ["agents", [".claude/agents/**", "evals/agents/**", "evals/proxy/**"]],
    ["workflow", ["evals/workflow/**", "evals/proxy/**", "evals/src/**", "!evals/src/**/*.test.ts"]],
  ])("workflow file for tier %s lists the engine paths in its pull_request paths", (tier, own) => {
    const root = join(dirname(SCRIPT), "..", "..");
    const text = readFileSync(join(root, ".github", "workflows", `harness-evals-${tier}.yml`), "utf8");
    const block = text.match(/^ {2}pull_request:\n {4}paths:\n((?: {6}- .*\n)+)/m);
    expect(block).not.toBeNull();
    const paths = [...(block as RegExpMatchArray)[1].matchAll(/- '([^']+)'/g)].map((m) => m[1]);
    const engine = [
      "evals/scripts/**",
      "evals/package.json",
      "evals/pnpm-lock.yaml",
      ".github/actions/harness-evals-setup/**",
      ".github/actions/harness-evals-detect/**",
      `.github/workflows/harness-evals-${tier}.yml`,
    ];
    for (const p of [...engine, ...own]) expect(paths).toContain(p);
  });
});
