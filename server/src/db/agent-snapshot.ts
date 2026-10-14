import type { AgentRow } from './rows.js';

/**
 * The `config_json` written to `agent_versions` for an agent: its config plus
 * the ordered linked skill ids and their names at snapshot time (so a version
 * still names a skill deleted later). Pure — the one place the shape is built,
 * shared by the agents repository and the seed.
 */
export function buildAgentSnapshotConfig(
  row: AgentRow,
  skills: { id: string; name: string }[],
) {
  return {
    provider: row.provider,
    model: row.model,
    system_prompt: row.systemPrompt,
    output_schema: row.outputSchema,
    strategy: row.strategy,
    ci_fail_on: row.ciFailOn,
    repo_intel: row.repoIntel,
    skills: skills.map((s) => s.id),
    skill_names: Object.fromEntries(skills.map((s) => [s.id, s.name])),
  };
}
