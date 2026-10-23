import type { LogLine } from "@devdigest/ui";
import type { RunTrace } from "@devdigest/shared";
import type { PromptGroup, RunTraceWithGroups } from "@devdigest/shared/contracts/skill-scope.js";

interface RawEvent {
  t: string;
  kind: string;
  msg: string;
}

/** Map run-bus events to the LiveLogStream LogLine shape. */
export function eventsToLog(events: RawEvent[]): LogLine[] {
  return events.map((e) => ({ t: e.t, k: e.kind as LogLine["k"], m: e.msg }));
}

/** Map a persisted trace's log to the LiveLogStream LogLine shape. */
export function traceLog(trace: RunTrace | undefined): LogLine[] {
  return trace?.log.map((l) => ({ t: l.t, k: l.kind as LogLine["k"], m: l.msg })) ?? [];
}

/** Seconds-formatted duration. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Token in→out summary (e.g. "12k→1.5k"). */
export function formatTokens(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}

/** Label of the single group shown for a trace written before grouping existed. */
export const LEGACY_GROUP_LABEL = "all";

/** Skill names from the `### Skill: <name>` headings of the rendered skills block. */
function skillNamesIn(text: string | null | undefined): { name: string; version: null }[] {
  if (!text) return [];
  const out: { name: string; version: null }[] = [];
  for (const m of text.matchAll(/^### Skill: (.+)$/gm)) out.push({ name: (m[1] ?? "").trim(), version: null });
  return out;
}

/**
 * The review calls of a run. A trace with `prompt_groups` lists them as stored;
 * an older one yields one legacy group: the files of each map-reduce chunk call,
 * or a single "all changed files" entry (`files: []`) for a single-pass run.
 */
export function promptGroupsOf(trace: RunTraceWithGroups): PromptGroup[] {
  if (trace.prompt_groups && trace.prompt_groups.length > 0) return trace.prompt_groups;
  const mapReduce = trace.tool_calls.some((tc) => tc.meta === "map-reduce");
  return [
    {
      label: LEGACY_GROUP_LABEL,
      files: mapReduce ? trace.tool_calls.filter((tc) => tc.meta === "map-reduce").map((tc) => tc.args) : [],
      skills: skillNamesIn(trace.prompt_assembly.skills),
      skipped: false,
    },
  ];
}
