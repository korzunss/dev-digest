/**
 * The three ways to run a case. Each composes runtime + artifacts; nothing here talks to the
 * SDK directly.
 *
 *   skillTask / agentTask — inject the artifact's content as system prompt, load NO on-disk
 *     config → measures the artifact's CONTENT in isolation.
 *   workflowTask — load the real on-disk harness (settingSources:["project"]) → measures the
 *     SYSTEMIC effect: does a skill activate, does a subagent dispatch, does CLAUDE.md matter.
 */

import { AGENT_DISALLOWED_TOOLS, IS_BASELINE, WORKFLOW_ALLOWED_TOOLS, WORKFLOW_BLOCKED_TOOLS, WORKFLOW_DISALLOWED_TOOLS } from "./config.js";
import { runClaude, type Result, type RunOptions } from "./runtime/run-claude.js";
import { createSandbox } from "./runtime/sandbox.js";
import { REPO_ROOT } from "./artifacts/paths.js";
import { runContent } from "./runtime/dispatch.js";
import { skillContent, agentContent, agentTools } from "./artifacts/load.js";

/**
 * Run a prompt with a skill's content injected (the 'candidate' condition). Under
 * EVAL_CONFIG=baseline the artifact is NOT injected — that is the benchmark's without-skill
 * baseline, i.e. the raw model, used to measure the skill's lift.
 */
export function skillTask(prompt: string, skillName: string, opts: RunOptions = {}) {
  const systemPrompt = IS_BASELINE ? undefined : skillContent(skillName);
  return runContent(prompt, { ...opts, systemPrompt });
}

/**
 * Run a prompt with a subagent's definition injected as the system prompt (baseline: none).
 *
 * A subagent is a TOOL-USING artifact — its whole method is "read the docs, grep the imports".
 * Running it content-only (no tools) both contradicts its own body ("you have Read/Glob/Grep")
 * and trips runClaude's "you have NO tools" directive, which makes a doc-grounded reviewer refuse
 * or downgrade every finding to `cannot-verify`. So we hand it exactly the tools it declares in
 * frontmatter and let it run from REPO_ROOT (runClaude's default cwd), the way production does.
 * Both conditions (candidate + baseline) get the same tools so the measured lift stays fair.
 * The agent keeps its declared read tools; Bash and the mutating tools are removed outright via
 * disallowedTools (not merely left off allowedTools, which restricts nothing under
 * bypassPermissions), and a case cannot re-enable them through opts.
 */
export function agentTask(prompt: string, agentName: string, opts: RunOptions = {}) {
  const systemPrompt = IS_BASELINE ? undefined : agentContent(agentName);
  const allowedTools = agentTools(agentName);
  return runClaude(prompt, { allowedTools, ...opts, disallowedTools: AGENT_DISALLOWED_TOOLS, systemPrompt });
}

/**
 * Run a prompt against the REAL on-disk harness (CLAUDE.md + project skills/agents loaded).
 * Use for workflow-level evals: skill activation, subagent dispatch, CLAUDE.md effect.
 * Ignores EVAL_CONFIG — the workflow tier has its own control-vs-treatment design.
 *
 * Safety, three layers — allowedTools alone does not restrict under bypassPermissions:
 *   1. the session runs in a throwaway worktree of the current tree (runtime/sandbox.ts), so a
 *      write that gets through lands in the copy; `filesChanged` lists it;
 *   2. Bash is removed and every Write/Edit is denied by a hook and logged as a write attempt —
 *      the hook once failed to fire, which is why layer 1 exists;
 *   3. the real repo's git status is compared before/after; a change there throws.
 * Paths in the returned trace are rewritten from the worktree back to REPO_ROOT.
 */
export async function workflowTask(prompt: string, opts: RunOptions = {}): Promise<Result> {
  const box = createSandbox();
  let result: Result | undefined;
  try {
    // A guessed root can contain an expected substring (`…/server/insights/gotchas.md` under a
    // non-existent dir) and used to pass a case — only reads of existing files count, early stop included.
    const stopWhen = opts.stopWhen;
    result = await runClaude(prompt, {
      allowedTools: WORKFLOW_ALLOWED_TOOLS,
      ...opts,
      ...(stopWhen ? { stopWhen: (p) => stopWhen({ ...p, filesRead: p.filesRead.filter(box.holds) }) } : {}),
      cwd: box.dir,
      disallowedTools: WORKFLOW_DISALLOWED_TOOLS,
      blockTools: WORKFLOW_BLOCKED_TOOLS,
      settingSources: ["project"],
    });
    result = {
      ...result,
      filesRead: result.filesRead.filter(box.holds).map(box.relocate),
      filesReadMissing: result.filesRead.filter((p) => !box.holds(p)),
      // A path already under REPO_ROOT (not the worktree) means the session aimed at the real
      // repo by absolute path — flag it, since relocate() would otherwise make both look alike.
      writeAttempts: result.writeAttempts.map((w) =>
        w.includes(`${REPO_ROOT}/`) ? `${w} [targets the REAL repo]` : box.relocate(w),
      ),
      filesChanged: box.changedFiles(),
    };
  } finally {
    box.dispose(); // throws if the real repo changed — overrides the result on purpose
  }
  return result;
}
