import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  CostSource,
  IntentConfidence,
  IntentSource,
  MissingContext,
  PromptSection,
} from '@devdigest/shared';
import type { PullRow } from '../../db/rows.js';

export type RepoRow = typeof t.repos.$inferSelect;
export type PrFileRow = typeof t.prFiles.$inferSelect;
export type PrIntentRow = typeof t.prIntent.$inferSelect;

/**
 * Everything `IntentService.classify` needs to persist after a
 * classification run (spec 006). `stale`/`stale_reason` are derived at read
 * time from `headSha`/`descriptionHash` against the PR row — never stored.
 */
export interface IntentUpsert {
  intent: string;
  inScope: string[];
  outOfScope: string[];
  confidence: IntentConfidence;
  sources: IntentSource[];
  missingContext: MissingContext[];
  composition: PromptSection[];
  headSha: string | null;
  descriptionHash: string | null;
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  costSource: CostSource | null;
  durationMs: number | null;
}

/**
 * A5 (spec 006) — the ONLY layer touching `pr_intent`'s classifier columns.
 * Workspace scoping is enforced via the PR row, same convention as
 * `reviews/repository/pull.repo.ts`.
 */
export class IntentRepository {
  constructor(private db: Db) {}

  /** PR + its repo, scoped by workspace. The repo row is needed by
   *  `container.forge(repo)` and `GitClient.readFileAt` calls in `IntentService`. */
  async getPull(
    workspaceId: string,
    prId: string,
  ): Promise<{ pull: PullRow; repo: RepoRow } | undefined> {
    const [row] = await this.db
      .select({ pull: t.pullRequests, repo: t.repos })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.pullRequests.repoId, t.repos.id))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  getPrFiles(prId: string): Promise<PrFileRow[]> {
    return this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }

  async upsert(prId: string, record: IntentUpsert): Promise<void> {
    const values = {
      prId,
      intent: record.intent,
      inScope: record.inScope,
      outOfScope: record.outOfScope,
      confidence: record.confidence,
      sources: record.sources,
      missingContext: record.missingContext,
      composition: record.composition,
      headSha: record.headSha,
      descriptionHash: record.descriptionHash,
      provider: record.provider,
      model: record.model,
      tokensIn: record.tokensIn,
      tokensOut: record.tokensOut,
      costUsd: record.costUsd,
      costSource: record.costSource,
      durationMs: record.durationMs,
    };
    // `classifiedAt` has a DB-side `defaultNow()`, which only fires on
    // INSERT — an update must set it explicitly or a re-classification of an
    // existing row keeps the original timestamp (V3).
    await this.db
      .insert(t.prIntent)
      .values(values)
      .onConflictDoUpdate({ target: t.prIntent.prId, set: { ...values, classifiedAt: new Date() } });
  }

  async get(prId: string): Promise<PrIntentRow | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    return row;
  }
}
