import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { workspaces } from './core';
import { agents } from './agents';
import { repos } from './repos';
import { pullRequests } from './pulls';
import { agentRuns } from './runs';

export const ciInstallations = pgTable(
  'ci_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repo: text('repo').notNull(),
    /** The connected repo this export targets; null once the repo is removed. */
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'set null' }),
    targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
    /** 'pr' = DevDigest opened the export PR, 'manual' = the user took the zip. */
    mode: text('mode', { enum: ['pr', 'manual'] }).notNull().default('pr'),
    /** What was exported: agent version, gate and workflow/runner versions. */
    exportedAgentVersion: integer('exported_agent_version'),
    exportedCiFailOn: text('exported_ci_fail_on', {
      enum: ['never', 'critical', 'warning', 'any'],
    }),
    workflowVersion: integer('workflow_version'),
    runnerVersion: text('runner_version'),
    triggers: text('triggers')
      .array()
      .notNull()
      .default(sql`ARRAY['opened','synchronize']::text[]`),
    postAs: text('post_as', { enum: ['github_review', 'pr_comment', 'none'] })
      .notNull()
      .default('github_review'),
    prNumber: integer('pr_number'),
    prUrl: text('pr_url'),
    /** Ingest high-water mark: the refresh lists runs created after this. */
    scanCursor: timestamp('scan_cursor', { withTimezone: true }),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    // One installation per (agent, repo): the install upserts on this key.
    // Both columns are notNull, so the index deduplicates every row.
    agentRepoIdx: uniqueIndex('ci_installations_agent_repo_idx').on(t.agentId, t.repo),
    // FK carries no index of its own.
    repoIdx: index('ci_installations_repo_idx').on(t.repoId),
  }),
);

export const ciRuns = pgTable(
  'ci_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
      onDelete: 'set null',
    }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    /** Snapshot of the name at ingest, so a deleted agent's runs stay readable. */
    agentName: text('agent_name').notNull(),
    /** The `agent_runs` row (source 'ci') created for this run; it has no pr_id. */
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    /** Local PR record, when the repo and PR number exist in the studio. */
    localPrId: uuid('local_pr_id').references(() => pullRequests.id, { onDelete: 'set null' }),
    repoFullName: text('repo_full_name').notNull(),
    githubRunId: bigint('github_run_id', { mode: 'number' }).notNull(),
    runAttempt: integer('run_attempt').notNull(),
    headSha: text('head_sha').notNull(),
    prNumber: integer('pr_number'),
    ranAt: timestamp('ran_at', { withTimezone: true }),
    status: text('status', { enum: ['passed', 'gate_failed', 'error'] }),
    verdict: text('verdict'),
    findingsCount: integer('findings_count'),
    costUsd: doublePrecision('cost_usd'),
    durationMs: integer('duration_ms'),
    model: text('model'),
    agentVersion: integer('agent_version'),
    runnerVersion: text('runner_version'),
    errorClass: text('error_class'),
    /** The job URL on GitHub. */
    githubUrl: text('github_url'),
    source: text('source'),
  },
  (t) => ({
    // Dedupe key for ingest: one record per (workspace, repo, GitHub run, attempt),
    // so a second workspace covering the same repo records its own runs.
    runAttemptIdx: uniqueIndex('ci_runs_run_attempt_idx').on(
      t.workspaceId,
      t.repoFullName,
      t.githubRunId,
      t.runAttempt,
    ),
    // The CI Runs page: a workspace's runs, newest first.
    wsRanIdx: index('ci_runs_ws_ran_idx').on(t.workspaceId, t.ranAt),
    // FK columns that are read or filtered carry no index of their own.
    // Also serves the latest-run-per-installation read (DISTINCT ON … ran_at DESC).
    installationIdx: index('ci_runs_installation_idx').on(t.ciInstallationId, t.ranAt),
    agentIdx: index('ci_runs_agent_idx').on(t.agentId),
    localPrIdx: index('ci_runs_local_pr_idx').on(t.localPrId),
  }),
);
