import {
  index,
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { agents } from './agents';
import { skills } from './skills';
import { pullRequests } from './pulls';

// ============================================================ Observability

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  prId: uuid('pr_id').references(() => pullRequests.id, { onDelete: 'set null' }),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
  provider: text('provider'),
  model: text('model'),
  durationMs: integer('duration_ms'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  /** Run cost in USD. Null = unknown (failed run / model the price book doesn't
   *  know / run older than spec 001) — distinct from 0, which is a free model. */
  costUsd: doublePrecision('cost_usd'),
  /** 'api' = the provider reported the price, 'estimate' = we priced it from
   *  tokens. Estimates render with a `~` prefix so the two never look alike. */
  costSource: text('cost_source', { enum: ['api', 'estimate'] }),
  status: text('status'),
  /** Failure reason when status='failed' (LLM/API error, timeout, quota, …). */
  error: text('error'),
  source: text('source', { enum: ['local', 'ci'] }).notNull().default('local'),
  findingsCount: integer('findings_count'),
  grounding: text('grounding'),
  /** Review score (0-100) for this run; null on failed/cancelled runs. */
  score: integer('score'),
  /** Findings that tripped the agent's gate (severity ≥ ciFailOn). */
  blockers: integer('blockers'),
}, (t) => ({
  // Every read of this table is "the runs of these PRs": the PR timeline, the
  // in-flight check, and the PR list's cost rollup. Postgres does not index a
  // FK column on its own, so without this each of those scans the whole table.
  prIdx: index('agent_runs_pr_idx').on(t.prId),
  // Skill stats and "this agent's runs" both filter on agent_id, which is a FK
  // and therefore carries no index of its own.
  agentIdx: index('agent_runs_agent_idx').on(t.agentId),
}));

/**
 * Which skills a run actually pulled into its prompt, in prompt order.
 *
 * Written by the run executor at assembly time. Without it there is no record
 * at all: the trace holds only the rendered text blob, which cannot be matched
 * back to a skill once its body is edited. Every Stats figure but "used by"
 * reads this table.
 */
export const runSkills = pgTable('run_skills', {
  runId: uuid('run_id')
    .notNull()
    .references(() => agentRuns.id, { onDelete: 'cascade' }),
  skillId: uuid('skill_id')
    .notNull()
    .references(() => skills.id, { onDelete: 'cascade' }),
  order: integer('order').notNull(),
  /** Tokens this skill's block contributed, when the tokenizer produced one. */
  tokens: integer('tokens'),
}, (t) => ({
  pk: primaryKey({ columns: [t.runId, t.skillId] }),
  // Every metric reads "the runs of THIS skill", and the composite PK only
  // covers the run side.
  skillIdx: index('run_skills_skill_idx').on(t.skillId),
}));

/** Whole trace of one run as a SINGLE jsonb document. */
export const runTraces = pgTable('run_traces', {
  runId: uuid('run_id')
    .primaryKey()
    .references(() => agentRuns.id, { onDelete: 'cascade' }),
  trace: jsonb('trace').notNull(),
});

export const multiAgentRuns = pgTable('multi_agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
});
