import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionCategory, ConventionStatus } from '@devdigest/shared';
import type { DropReason } from './types.js';

/**
 * Conventions data-access. Owns `conventions` and `convention_scans`, plus the
 * workspace-scoped repo lookup the service needs to resolve a clone path.
 * Every query carries `workspaceId`: an id alone would read another tenant's
 * repo, and both tables are addressed by id from the routes.
 */

export type ConventionRow = typeof t.conventions.$inferSelect;
export type ConventionScanRow = typeof t.conventionScans.$inferSelect;

/** What the service needs to find a clone and name a skill after the repo. */
export interface ConventionRepoRef {
  id: string;
  owner: string;
  name: string;
  fullName: string;
}

export interface InsertScan {
  workspaceId: string;
  repoId: string;
  commitSha: string | null;
  provider: string;
  model: string;
  samplePaths: string[];
}

/** The terminal half of a scan row — written once the model has answered. */
export interface FinishScan {
  status: 'done' | 'error';
  candidatesRaw?: number;
  candidatesKept?: number;
  dropped?: Partial<Record<DropReason, number>>;
  tokensIn?: number | null;
  tokensOut?: number | null;
  costUsd?: number | null;
  costSource?: string | null;
  error?: string | null;
}

/** One grounded candidate, ready to be upserted onto its `(repo, fingerprint)`. */
export interface UpsertCandidate {
  workspaceId: string;
  repoId: string;
  scanId: string;
  rule: string;
  category: ConventionCategory;
  evidencePath: string;
  evidenceLine: number;
  evidenceEndLine: number;
  evidenceSnippet: string;
  confidence: number;
  fingerprint: string;
}

export interface UpdateCandidate {
  rule?: string;
  category?: ConventionCategory;
  status?: ConventionStatus;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async getRepoRef(workspaceId: string, repoId: string): Promise<ConventionRepoRef | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  // ---- convention_scans ----------------------------------------------------

  /** Open a scan row BEFORE the model call, so a failure has somewhere to land. */
  async createScan(values: InsertScan): Promise<ConventionScanRow> {
    const [row] = await this.db
      .insert(t.conventionScans)
      .values({
        workspaceId: values.workspaceId,
        repoId: values.repoId,
        commitSha: values.commitSha,
        provider: values.provider,
        model: values.model,
        samplePaths: values.samplePaths,
      })
      .returning();
    return row!;
  }

  async finishScan(
    workspaceId: string,
    scanId: string,
    patch: FinishScan,
  ): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .update(t.conventionScans)
      .set({
        status: patch.status,
        finishedAt: new Date(),
        ...(patch.candidatesRaw !== undefined ? { candidatesRaw: patch.candidatesRaw } : {}),
        ...(patch.candidatesKept !== undefined ? { candidatesKept: patch.candidatesKept } : {}),
        ...(patch.dropped !== undefined ? { dropped: toTally(patch.dropped) } : {}),
        ...(patch.tokensIn !== undefined ? { tokensIn: patch.tokensIn } : {}),
        ...(patch.tokensOut !== undefined ? { tokensOut: patch.tokensOut } : {}),
        ...(patch.costUsd !== undefined ? { costUsd: patch.costUsd } : {}),
        ...(patch.costSource !== undefined ? { costSource: patch.costSource } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
      })
      .where(
        and(
          eq(t.conventionScans.workspaceId, workspaceId),
          eq(t.conventionScans.id, scanId),
        ),
      )
      .returning();
    return row;
  }

  /**
   * The newest scan of a repo, whatever its status — a failed run is a result
   * the screen has to be able to show, not a row to hide.
   */
  async latestScan(
    workspaceId: string,
    repoId: string,
  ): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(
        and(
          eq(t.conventionScans.workspaceId, workspaceId),
          eq(t.conventionScans.repoId, repoId),
        ),
      )
      .orderBy(desc(t.conventionScans.createdAt))
      .limit(1);
    return row;
  }

  // ---- conventions ---------------------------------------------------------

  /**
   * Insert this scan's candidates, refreshing the ones already on file.
   *
   * `ON CONFLICT (repo_id, fingerprint) DO UPDATE` deliberately leaves `status`
   * and `skill_id` alone: those are the user's decisions, and re-running a scan
   * must not resurrect a rejected rule as pending or unlink an accepted one
   * from the skill it was folded into. Everything else — which scan last saw
   * the rule, how confident the model was, where the evidence sits now — is a
   * fresh sighting and is overwritten.
   *
   * Values come straight from `excluded` rather than from a captured row so one
   * statement can carry every candidate. Two rows sharing a fingerprint in the
   * same statement would make Postgres refuse ("cannot affect row a second
   * time"); the grounding gate already drops in-scan duplicates, which is the
   * only reason that cannot happen here.
   */
  async upsertCandidates(values: UpsertCandidate[]): Promise<void> {
    if (values.length === 0) return;
    await this.db
      .insert(t.conventions)
      .values(
        values.map((v) => ({
          workspaceId: v.workspaceId,
          repoId: v.repoId,
          scanId: v.scanId,
          rule: v.rule,
          category: v.category,
          evidencePath: v.evidencePath,
          evidenceLine: v.evidenceLine,
          evidenceEndLine: v.evidenceEndLine,
          evidenceSnippet: v.evidenceSnippet,
          confidence: v.confidence,
          fingerprint: v.fingerprint,
        })),
      )
      .onConflictDoUpdate({
        target: [t.conventions.repoId, t.conventions.fingerprint],
        set: {
          scanId: sql`excluded.scan_id`,
          rule: sql`excluded.rule`,
          category: sql`excluded.category`,
          evidencePath: sql`excluded.evidence_path`,
          evidenceLine: sql`excluded.evidence_line`,
          evidenceEndLine: sql`excluded.evidence_end_line`,
          evidenceSnippet: sql`excluded.evidence_snippet`,
          confidence: sql`excluded.confidence`,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * The candidates of one scan, strongest first with a total tie-break — the
   * card order has to survive a reload, and `ORDER BY confidence` alone leaves
   * equally confident rules to the planner.
   */
  async listByScan(workspaceId: string, scanId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.scanId, scanId)),
      )
      .orderBy(
        desc(t.conventions.confidence),
        asc(t.conventions.evidencePath),
        asc(t.conventions.evidenceLine),
        asc(t.conventions.id),
      );
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateCandidate,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        // `fingerprint` is NOT recomputed from an edited rule. It is the row's
        // identity across scans: re-deriving it here would leave the next scan's
        // (unedited) proposal without a match, and the rule would come back a
        // second time as a pending duplicate.
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  /** Record which skill consumed each candidate, once the skill exists. */
  async stampSkill(workspaceId: string, ids: string[], skillId: string): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(t.conventions)
      .set({ skillId, updatedAt: new Date() })
      .where(
        and(eq(t.conventions.workspaceId, workspaceId), inArray(t.conventions.id, ids)),
      );
  }
}

/**
 * `Partial<Record<DropReason, number>>` types every value `number | undefined`;
 * the jsonb column holds a plain map where an absent reason means zero.
 */
function toTally(dropped: Partial<Record<DropReason, number>>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(dropped).filter((entry): entry is [string, number] => entry[1] !== undefined),
  );
}
