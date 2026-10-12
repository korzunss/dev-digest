import { pgTable, index, uniqueIndex, uuid, text, integer, boolean, jsonb, timestamp, doublePrecision } from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { agents } from './agents';
import { findings } from './reviews';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable('eval_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
  ownerId: uuid('owner_id').notNull(),
  name: text('name').notNull(),
  inputDiff: text('input_diff'),
  inputFiles: jsonb('input_files'),
  inputMeta: jsonb('input_meta'),
  expectedOutput: jsonb('expected_output'),
  notes: text('notes'),
}, (t) => ({
  // Backs the onConflictDoUpdate in modules/eval/repository.ts.
  ownerNameUq: uniqueIndex('eval_cases_owner_name_idx').on(t.workspaceId, t.ownerKind, t.ownerId, t.name),
}));

export const evalRuns = pgTable('eval_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id')
    .notNull()
    .references(() => evalCases.id, { onDelete: 'cascade' }),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
  actualOutput: jsonb('actual_output'),
  pass: boolean('pass'),
  recall: doublePrecision('recall'),
  precision: doublePrecision('precision'),
  citationAccuracy: doublePrecision('citation_accuracy'),
  durationMs: integer('duration_ms'),
  costUsd: doublePrecision('cost_usd'),
});

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});

// ============================================================ Eval pipeline (plan 34)
// Regression suites per agent. Separate from eval_cases / eval_runs above, which
// stay untouched (they serve the skill/agent eval cases).

export const evalSuiteCases = pgTable('eval_suite_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  inputDiff: text('input_diff').notNull(),
  inputFiles: jsonb('input_files').notNull(),
  inputMeta: jsonb('input_meta'),
  expected: jsonb('expected').notNull(),
  sourceFindingId: uuid('source_finding_id').references(() => findings.id, { onDelete: 'set null' }),
  sourcePrId: uuid('source_pr_id').references(() => pullRequests.id, { onDelete: 'set null' }),
  lastResult: jsonb('last_result'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  agentNameUq: uniqueIndex('eval_suite_cases_agent_name_idx').on(t.agentId, t.name),
  // One case per finding. NULLs are distinct in a unique index, so hand-written
  // cases (source_finding_id NULL) never collide — that is wanted.
  sourceFindingUq: uniqueIndex('eval_suite_cases_source_finding_idx').on(t.sourceFindingId),
  sourcePrIdx: index('eval_suite_cases_source_pr_idx').on(t.sourcePrId),
}));

export const evalSuiteRuns = pgTable('eval_suite_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  agentVersion: integer('agent_version').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  skills: jsonb('skills').notNull(),
  status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  casesTotal: integer('cases_total').notNull().default(0),
  casesDone: integer('cases_done').notNull().default(0),
  casesPassed: integer('cases_passed').notNull().default(0),
  casesErrored: integer('cases_errored').notNull().default(0),
  recall: doublePrecision('recall'),
  precision: doublePrecision('precision'),
  citationAccuracy: doublePrecision('citation_accuracy'),
  costUsd: doublePrecision('cost_usd'),
}, (t) => ({
  agentStartedIdx: index('eval_suite_runs_agent_started_idx').on(t.agentId, t.startedAt),
  workspaceStartedIdx: index('eval_suite_runs_workspace_started_idx').on(t.workspaceId, t.startedAt),
}));

export const evalCaseResults = pgTable('eval_case_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  suiteRunId: uuid('suite_run_id')
    .notNull()
    .references(() => evalSuiteRuns.id, { onDelete: 'cascade' }),
  // Deleting a case cascades its results; the run's stored metrics stay.
  caseId: uuid('case_id').references(() => evalSuiteCases.id, { onDelete: 'cascade' }),
  caseName: text('case_name').notNull(),
  result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  runIdx: index('eval_case_results_run_idx').on(t.suiteRunId),
  caseIdx: index('eval_case_results_case_idx').on(t.caseId),
}));
