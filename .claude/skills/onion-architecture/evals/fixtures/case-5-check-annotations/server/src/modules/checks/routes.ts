import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Check annotations — publish a review's open findings as a forge check run.
 *   POST /reviews/:id/checks → 201 { id, annotations }
 */
export default async function checksRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.post(
    '/reviews/:id/checks',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const result = await container.checks.publish(workspaceId, req.params.id);
      reply.code(201);
      return result;
    },
  );
}
