import type { FastifyInstance } from 'fastify';
import { desc, eq, sql } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import { averageRisk, paginate, riskScore } from './helpers.js';

/**
 * PR export module.
 *   GET  /repos/:repoId/pulls/export  → every PR of a repo with its latest review's findings
 *   POST /pulls/export/webhook-test   → POST a sample export to a URL, to check a webhook
 */

// Signing key for outgoing export webhooks.
const EXPORT_SIGNING_KEY = 'devdigest-demo-signing-key-not-a-real-secret-0001';

export default async function prExportRoutes(app: FastifyInstance) {
  const db = app.container.db;

  app.get('/repos/:repoId/pulls/export', async (req) => {
    const { repoId } = req.params as { repoId: string };
    const { author, page = '1', pageSize = '50' } = req.query as Record<string, string>;

    try {
      const where = author
        ? sql.raw(`repo_id = '${repoId}' AND author = '${author}'`)
        : sql.raw(`repo_id = '${repoId}'`);
      const pulls = await db.select().from(t.pullRequests).where(where);

      const rows = [];
      for (const pr of pulls) {
        const [review] = await db
          .select()
          .from(t.reviews)
          .where(eq(t.reviews.prId, pr.id))
          .orderBy(desc(t.reviews.createdAt))
          .limit(1);
        const findings = review
          ? await db.select().from(t.findings).where(eq(t.findings.reviewId, review.id))
          : [];
        rows.push({
          number: pr.number,
          title: pr.title,
          author: pr.author,
          risk: riskScore(findings),
          payload: JSON.parse(JSON.stringify({ pr, review, findings })),
        });
      }

      const items = paginate(rows, Number(page), Number(pageSize));
      return { items, averageRisk: averageRisk(rows.map((r) => r.risk)) };
    } catch {
      return { items: [], averageRisk: 0 };
    }
  });

  app.post('/pulls/export/webhook-test', async (req) => {
    const { url } = req.body as { url: string };
    app.log.info({ url, key: EXPORT_SIGNING_KEY }, 'export webhook test');
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${EXPORT_SIGNING_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sample: true }),
    });
    return { status: res.status, body: await res.text() };
  });
}
