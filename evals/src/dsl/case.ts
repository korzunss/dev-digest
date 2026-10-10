/**
 * Case types + the runners that turn a data array into vitest tests. This module owns the ONE
 * true measure → (log) → assert body, so case authors never rewrite it — which is exactly what
 * keeps the "assert before record" bug from recurring once record() lands (T2 slots into the
 * marked spot below, in this one file).
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "vitest";
import { DEFAULT_THRESHOLD } from "../config.js";
import { skillTask, agentTask, workflowTask } from "../tasks.js";
import { runClaude, type Result, type RunOptions } from "../runtime/run-claude.js";
import { patternMatch } from "../scoring/pattern-match.js";
import { llmJudge, type Verdict } from "../scoring/llm-judge.js";
import { logTrace, logVerdict } from "../logging/log.js";
import { record } from "../records/record.js";

// --- Case shapes ------------------------------------------------------------

/** A judge-and-grounding case. Same shape for skills and agents; only the task differs. */
export interface QualityCase {
  name: string;
  kind?: "quality" | "grounding";
  prompt: string;
  /** Practices the judge scores (quality). Omit for a pure grounding case. */
  practices?: string[];
  /** Substrings that must ALL appear before the judge runs (cheap-tier gate). */
  grounding?: string[];
  /** Judge score gate (default 0.6). */
  threshold?: number;
  maxTurns?: number;
}
export type SkillCase = QualityCase;
export type AgentCase = QualityCase;

/** A trace-asserted workflow case — a discriminated union routed by `kind`. */
export type WorkflowCase =
  | { kind: "dispatch"; name: string; prompt: string; expectSubagent: string; maxTurns?: number }
  | {
      kind: "activation";
      name: string;
      prompt: string;
      skill: string;
      shouldActivate: boolean;
      maxTurns?: number;
    }
  | {
      kind: "contrast";
      name: string;
      prompt: string;
      expectFileRead: string;
      tools?: string[];
      maxTurns?: number;
    }
  | {
      // A single-session composite: run ONE workflowTask and assert several trace facets at once.
      // Cheaper than separate dispatch/activation/contrast cases (one session, not N) at the cost
      // of coarser diagnostics and no control run — use contrast when you must isolate CLAUDE.md's
      // contribution. Every provided expectation must hold; omitted fields are not checked.
      kind: "trace";
      name: string;
      prompt: string;
      expectSubagents?: string[];
      expectSkills?: string[];
      expectFilesRead?: string[];
      /** Negatives: none of these subagents may be launched (e.g. no spec-creator for a bug fix). */
      expectNotSubagents?: string[];
      /** Negatives: no read path may contain any of these substrings (e.g. server/clones/). */
      expectNotRead?: string[];
      /** Negatives: no Write/Edit attempt (blocked or not) on a path containing these substrings. */
      expectNoWriteTo?: string[];
      maxTurns?: number;
    };

/** Did a skill engage? Either an explicit Skill tool-call, or reading its SKILL.md. */
export function activated(result: Pick<Result, "skillsInvoked" | "filesRead">, skill: string): boolean {
  const bySkill = result.skillsInvoked.some((s) => s === skill || s.endsWith(`:${skill}`));
  const byRead = result.filesRead.some((f) => f.includes(`skills/${skill}/SKILL.md`));
  return bySkill || byRead;
}

// --- Runners ----------------------------------------------------------------

type Task = (prompt: string, artifact: string, opts?: RunOptions) => Promise<Result>;

function runQualityCases(artifact: string, cases: QualityCase[], task: Task): void {
  for (const c of cases) {
    test(c.name, async () => {
      const threshold = c.threshold ?? DEFAULT_THRESHOLD;
      const result = await task(c.prompt, artifact, { maxTurns: c.maxTurns });
      logTrace(c.name, result);

      // measure → record → assert. Everything measurable runs in the try; record() fires in the
      // finally with whatever accumulated; the asserts happen strictly after. A failing config
      // (e.g. baseline: grounding gate fails, judge skipped) still leaves a record.
      let grounded: number | undefined;
      let verdict: Verdict | undefined;
      try {
        // Cheap deterministic tier first — the grounding gate. When it fails the judge is skipped.
        if (c.grounding?.length) grounded = patternMatch(result.text, c.grounding);
        if (c.practices?.length && (grounded === undefined || grounded === 1)) {
          verdict = await llmJudge(result.text, c.practices);
          logVerdict(c.name, verdict);
        }
      } finally {
        record(c.name, { result, verdict, grounded, threshold });
      }

      if (grounded !== undefined) {
        expect(grounded, `missing concrete evidence; output:\n${result.text}`).toBe(1);
      }
      if (verdict) {
        expect(verdict.score, JSON.stringify(verdict.results)).toBeGreaterThanOrEqual(threshold);
      }
    });
  }
}

export const runSkillCases = (skill: string, cases: SkillCase[]) => runQualityCases(skill, cases, skillTask);
export const runAgentCases = (agent: string, cases: AgentCase[]) => runQualityCases(agent, cases, agentTask);

export function runWorkflowCases(cases: WorkflowCase[]): void {
  // Each branch collects its failures as messages first, records the outcome from them, then
  // asserts. Recording `passed` explicitly keeps eval:repeat honest: without it a workflow record
  // fell back to "did the session end without an error", which ignored every expectation.
  const finish = (name: string, result: Result, failures: string[]) => {
    record(name, { result, passed: failures.length === 0 });
    expect(failures, failures.join("\n")).toEqual([]);
  };

  for (const c of cases) {
    test(c.name, async () => {
      if (c.kind === "dispatch") {
        // Stop the moment the subagent is launched — no need to wait out its nested session.
        const expect1 = c.expectSubagent;
        const result = await workflowTask(c.prompt, {
          maxTurns: c.maxTurns,
          stopWhen: (p) => p.subagents.includes(expect1),
        });
        logTrace(c.name, result);
        const failures = result.subagents.includes(c.expectSubagent)
          ? []
          : [`subagent ${c.expectSubagent} not launched | subagents: ${result.subagents.join(", ")}`];
        finish(c.name, result, failures);
      } else if (c.kind === "activation") {
        // A positive stops as soon as the skill engages. Hitting maxTurns (isError) is not a
        // failure here: the assertion is only whether the skill engaged.
        const result = await workflowTask(c.prompt, {
          maxTurns: c.maxTurns,
          stopWhen: c.shouldActivate ? (p) => activated(p, c.skill) : undefined,
        });
        logTrace(c.name, result);
        const got = activated(result, c.skill);
        const failures =
          got === c.shouldActivate
            ? []
            : [
                `skill ${c.skill} activated=${got}, expected ${c.shouldActivate} | skills: ` +
                  `${result.skillsInvoked.join(", ")} | reads: ${result.filesRead.join(", ")}`,
              ];
        finish(c.name, result, failures);
      } else if (c.kind === "trace") {
        // One session, many asserts — every provided expectation is checked against the same trace.
        // Stop as soon as ALL expectations are satisfied (e.g. doc read + subagent launched), so a
        // dispatch-bearing trace doesn't pay for the nested subagent's full run.
        const subs = c.expectSubagents ?? [];
        const skls = c.expectSkills ?? [];
        const files = c.expectFilesRead ?? [];
        const notSubs = c.expectNotSubagents ?? [];
        const notFiles = c.expectNotRead ?? [];
        const noWrite = c.expectNoWriteTo ?? [];
        // With no positive expectation `every` over empty lists is vacuously true, which would stop a
        // negatives-only case after its first tool call — such a case runs to its natural end instead.
        const hasPositive = subs.length + skls.length + files.length > 0;
        const violated = (p: { subagents: string[]; filesRead: string[] }) =>
          notSubs.some((s) => p.subagents.includes(s)) || p.filesRead.some((r) => notFiles.some((f) => r.includes(f)));
        const result = await workflowTask(c.prompt, {
          maxTurns: c.maxTurns,
          stopWhen: (p) =>
            violated(p) ||
            (hasPositive &&
              subs.every((s) => p.subagents.includes(s)) &&
              skls.every((s) => activated(p, s)) &&
              files.every((f) => p.filesRead.some((r) => r.includes(f)))),
        });
        logTrace(c.name, result);
        const reads = result.filesRead.join(", ");
        const failures = [
          ...subs
            .filter((s) => !result.subagents.includes(s))
            .map((s) => `subagent ${s} not launched | subagents: ${result.subagents.join(", ")}`),
          ...skls
            .filter((s) => !activated(result, s))
            .map((s) => `skill ${s} not engaged | skills: ${result.skillsInvoked.join(", ")} | reads: ${reads}`),
          ...files.filter((f) => !result.filesRead.some((r) => r.includes(f))).map((f) => `${f} not read | reads: ${reads}`),
          ...notSubs.filter((s) => result.subagents.includes(s)).map((s) => `subagent ${s} must not be launched`),
          ...notFiles.flatMap((f) => result.filesRead.filter((r) => r.includes(f)).map((r) => `must not read ${r}`)),
          ...noWrite.flatMap((f) => result.writeAttempts.filter((w) => w.includes(f)).map((w) => `must not try to write: ${w}`)),
          ...(result.isError ? [`session ended with an error (e.g. maxTurns ${c.maxTurns ?? "default"} hit)`] : []),
        ];
        finish(c.name, result, failures);
      } else {
        // contrast: treatment (real harness) vs control (empty tmpdir, no on-disk config).
        const tools = c.tools ?? ["Read", "Grep", "Glob"];
        const treatment = await workflowTask(c.prompt, { allowedTools: tools, maxTurns: c.maxTurns });
        const emptyCwd = mkdtempSync(join(tmpdir(), "eval-control-"));
        const control = await runClaude(c.prompt, {
          allowedTools: tools,
          maxTurns: c.maxTurns,
          cwd: emptyCwd,
          settingSources: [],
        });
        logTrace(`${c.name} [treatment]`, treatment);
        logTrace(`${c.name} [control]`, control);
        const treatmentRead = treatment.filesRead.some((f) => f.includes(c.expectFileRead));
        const controlRead = control.filesRead.some((f) => f.includes(c.expectFileRead));
        record(`${c.name} [treatment]`, { result: treatment, passed: treatmentRead });
        record(`${c.name} [control]`, { result: control, passed: !controlRead });
        expect(treatmentRead, `treatment reads: ${treatment.filesRead.join(", ")}`).toBe(true);
        expect(controlRead, `control reads: ${control.filesRead.join(", ")}`).toBe(false);
      }
    });
  }
}
