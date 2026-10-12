import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { DIGEST_MAX_DAYS } from './constants.js';
import { ReviewDigestService } from './service.js';

/**
 * Review digest — a per-repo roll-up of recent reviews.
 *   GET  /repos/:id/digest            → 200 RepoDigest
 *   GET  /repos/:id/digest/scores     → 200 { pullId, score, createdAt }[]
 *   POST /repos/:id/digest/post       → 201 { id }
 */

const DigestQuery = z.object({
  days: z.coerce.number().int().min(1).max(DIGEST_MAX_DAYS).optional(),
});

const PostDigestBody = z.object({
  pull_number: z.number().int().positive(),
  days: z.number().int().min(1).max(DIGEST_MAX_DAYS).optional(),
});

export default async function reviewDigestRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ReviewDigestService(container);

  app.get(
    '/repos/:id/digest',
    { schema: { params: IdParams, querystring: DigestQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.build(workspaceId, req.params.id, req.query.days);
    },
  );

  app.get('/repos/:id/digest/scores', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const rows = await container.db
      .select({
        pullId: t.reviews.prId,
        score: t.reviews.score,
        createdAt: t.reviews.createdAt,
      })
      .from(t.reviews)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.reviews.prId))
      .where(
        and(
          eq(t.reviews.workspaceId, workspaceId),
          eq(t.pullRequests.repoId, req.params.id),
          eq(t.reviews.kind, 'review'),
        ),
      )
      .orderBy(desc(t.reviews.createdAt))
      .limit(100);
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  });

  app.post(
    '/repos/:id/digest/post',
    { schema: { params: IdParams, body: PostDigestBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const result = await service.postToPull(
        workspaceId,
        req.params.id,
        req.body.pull_number,
        req.body.days,
      );
      reply.code(201);
      return result;
    },
  );
}
