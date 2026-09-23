import { pgTable, uuid, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { now } from './_shared';
import { workspaces, users } from './core';

export const repos = pgTable(
  'repos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    // Which forge this repo lives on. `text(..., { enum })` is a TypeScript-level
    // narrowing only — Drizzle emits a plain `text NOT NULL`, no CHECK and no
    // pg enum — so adding a forge later is a code-only change, and a row can
    // hold a value TypeScript forbids. Keep row→DTO mappers total.
    provider: text('provider', { enum: ['github', 'gitlab'] })
      .notNull()
      .default('github'),
    /**
     * Origin PLUS any path prefix of a self-managed instance
     * (`https://git.acme.com`, or `https://acme.com/gitlab` for a relative-URL
     * install). Null ⇒ the provider's public default. Deliberately not a bare
     * host: the REST base is `${api_base}/api/v4` and the client builds
     * deep-links from the same value, so the prefix has to survive.
     */
    apiBase: text('api_base'),
    owner: text('owner').notNull(),
    name: text('name').notNull(),
    fullName: text('full_name').notNull(),
    defaultBranch: text('default_branch').notNull().default('main'),
    clonePath: text('clone_path'),
    lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: now(),
  },
  (t) => ({
    // Forge AND instance are part of the key: `acme/api` can legitimately exist
    // on GitHub and GitLab at once, and `team/api` can exist on two different
    // self-managed GitLabs. `coalesce` is load-bearing — Postgres treats NULLs
    // as distinct in a unique index, so a bare `api_base` column would stop
    // deduplicating every hosted repo (the null case, i.e. most of them).
    uq: uniqueIndex('repos_ws_forge_fullname_uq').on(
      t.workspaceId,
      t.provider,
      sql`coalesce(${t.apiBase}, '')`,
      t.fullName,
    ),
    wsIdx: index('repos_ws_idx').on(t.workspaceId),
  }),
);
