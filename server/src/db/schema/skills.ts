import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    type: text('type', { enum: ['rubric', 'convention', 'security', 'custom'] }).notNull(),
    // Anything but 'manual' came from outside this workspace: it lands disabled
    // and stays badged "needs vetting" until a person reads the body and
    // enables it. Plain `text` in SQL — adding a value needs no migration.
    source: text('source', {
      enum: ['manual', 'imported_file', 'imported_url', 'extracted', 'community'],
    }).notNull(),
    body: text('body').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    version: integer('version').notNull().default(1),
    evidenceFiles: jsonb('evidence_files').$type<string[]>(),
    createdAt: now(),
  },
  // `GET /skills` filters on workspace_id, and Postgres indexes the column a FK
  // POINTS AT, never the column holding it — so this is not implied by the
  // `.references()` above.
  (t) => ({ wsIdx: index('skills_ws_idx').on(t.workspaceId) }),
);

export const skillVersions = pgTable(
  'skill_versions',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    // What the author said changed. Nullable: versions written before this
    // column existed have none, and a save may legitimately carry no note.
    message: text('message'),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.version] }) }),
);

/**
 * Project-context documents attached to a skill, in prompt order.
 *
 * Keyed by PATH, not by an id: these are markdown files in the repo clone and
 * have no row of their own anywhere. A workspace can hold several repos, so an
 * attached path may not exist in the repo of a given PR — the run executor
 * skips those rather than failing the run.
 */
export const skillContextDocs = pgTable(
  'skill_context_docs',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    order: integer('order').notNull().default(0),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.path] }) }),
);
