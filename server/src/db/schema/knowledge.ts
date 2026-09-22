import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  doublePrecision,
  integer,
  vector,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';
import { skills } from './skills';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

// ============================================================ Conventions

/**
 * One conventions-extraction run over a repo (spec 004).
 *
 * `commitSha` is the reason this table exists at all: the evidence links on the
 * Conventions screen are pinned to it, so a push landing after the scan cannot
 * slide a cited line out from under a card. `samplePaths` records exactly what
 * the model was shown, which is the only way to tell "this repo has no such
 * convention" apart from "we never gave it that file".
 */
export const conventionScans = pgTable(
  'convention_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    commitSha: text('commit_sha'),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    samplePaths: jsonb('sample_paths').$type<string[]>().notNull(),
    candidatesRaw: integer('candidates_raw').notNull().default(0),
    candidatesKept: integer('candidates_kept').notNull().default(0),
    /** Per-reason drop tally from the evidence gate, e.g. `{ snippet_absent: 3 }`. */
    dropped: jsonb('dropped').$type<Record<string, number>>(),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    costUsd: doublePrecision('cost_usd'),
    costSource: text('cost_source'),
    status: text('status', { enum: ['running', 'done', 'error'] })
      .notNull()
      .default('running'),
    error: text('error'),
    createdAt: now(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  // `.references()` declares the constraint, never the index — and the screen's
  // one query is "latest scan for this repo".
  (t) => ({ repoIdx: index('convention_scans_repo_idx').on(t.repoId) }),
);

/**
 * One extracted house rule, after the evidence gate. Every row here cites code
 * that really existed in `scan.commitSha` — candidates whose snippet could not
 * be found in the file they named are dropped before insert, never stored as
 * "unverified".
 *
 * `fingerprint` (normalised rule + evidence path) plus the unique index below is
 * what makes re-scanning safe: a second scan UPSERTs onto the same row, so a
 * rule the user already rejected cannot come back as pending. That property
 * lives in the schema rather than in the service remembering to check.
 */
export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    // Kept on `set null` so deleting an old scan never deletes the decisions a
    // person made on its candidates.
    scanId: uuid('scan_id').references(() => conventionScans.id, { onDelete: 'set null' }),
    rule: text('rule').notNull(),
    category: text('category', {
      enum: [
        'naming',
        'structure',
        'error-handling',
        'async',
        'data-access',
        'api',
        'testing',
        'tooling',
      ],
    }).notNull(),
    evidencePath: text('evidence_path').notNull(),
    evidenceLine: integer('evidence_line').notNull(),
    evidenceEndLine: integer('evidence_end_line').notNull(),
    evidenceSnippet: text('evidence_snippet').notNull(),
    confidence: doublePrecision('confidence'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    fingerprint: text('fingerprint').notNull(),
    skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    repoIdx: index('conventions_repo_idx').on(t.repoId),
    scanIdx: index('conventions_scan_idx').on(t.scanId),
    fpUq: uniqueIndex('conventions_repo_fp_uq').on(t.repoId, t.fingerprint),
  }),
);
