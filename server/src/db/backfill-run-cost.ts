import 'dotenv/config';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { estimateCost } from '../adapters/llm/pricing.js';

/**
 * One-shot backfill of `agent_runs.cost_usd` for runs that finished before the
 * cost columns existed (spec 001).
 *
 * Every such row still carries `tokens_in` / `tokens_out` / `model`, so a price
 * can be reconstructed — but only as an ESTIMATE: the provider's reported cost
 * was never captured and cannot be recovered. That is exactly what
 * `cost_source = 'estimate'` records, and why the UI shows these with a `~`.
 *
 * Idempotent by construction: it only ever reads rows whose cost is NULL, so a
 * second run is a no-op. Rows whose model is unknown to the price book stay
 * NULL and keep rendering "—" — a wrong number would be worse than none.
 *
 * The estimator is injected so the caller decides where prices come from: the
 * CLI passes the static table, tests pass a stub.
 */

export type Estimator = (model: string, tokensIn: number, tokensOut: number) => number | null;

export interface BackfillReport {
  /** Rows that got a price. */
  updated: number;
  /** Rows left NULL because the price book doesn't know the model. */
  unknownModel: number;
}

export async function backfillRunCost(db: Db, estimate: Estimator): Promise<BackfillReport> {
  const rows = await db
    .select({
      id: t.agentRuns.id,
      model: t.agentRuns.model,
      tokensIn: t.agentRuns.tokensIn,
      tokensOut: t.agentRuns.tokensOut,
    })
    .from(t.agentRuns)
    .where(
      and(
        isNull(t.agentRuns.costUsd),
        isNotNull(t.agentRuns.model),
        isNotNull(t.agentRuns.tokensIn),
      ),
    );

  const report: BackfillReport = { updated: 0, unknownModel: 0 };
  for (const row of rows) {
    const cost = estimate(row.model ?? '', row.tokensIn ?? 0, row.tokensOut ?? 0);
    if (cost == null) {
      report.unknownModel += 1;
      continue;
    }
    await db
      .update(t.agentRuns)
      .set({ costUsd: cost, costSource: 'estimate' })
      .where(eq(t.agentRuns.id, row.id));
    report.updated += 1;
  }
  return report;
}

// CLI entrypoint — `pnpm db:backfill-cost`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const { db, close } = createDb(url);
  // The static price table, not the live PriceBook: it needs no secrets, and it
  // is what runs of that era were priced against anyway. Either way the result
  // is marked `estimate`, so nothing here can masquerade as a reported price.
  backfillRunCost(db, estimateCost)
    .then(async (r) => {
      console.log(`✓ backfilled ${r.updated} run(s) as estimates`);
      if (r.unknownModel > 0) {
        console.log(`  ${r.unknownModel} run(s) left unpriced — model unknown to the price book`);
      }
      await close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ backfill failed:', err);
      await close();
      process.exit(1);
    });
}
