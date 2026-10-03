import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadius, PrHistory } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * Blast Radius module.
 *   GET /pulls/:id/blast   → BlastRadius (read from the persistent repo index)
 *   GET /pulls/:id/history → PrHistory   (prior merged PRs touching the files)
 * Workspace scoping is enforced by `getContext` + the service, never by input.
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.blast;

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadius } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.getBlast(workspaceId, req.params.id, req.log);
      if (result === undefined) throw new NotFoundError('Pull request not found');
      return result;
    },
  );

  app.get(
    '/pulls/:id/history',
    { schema: { params: IdParams, response: { 200: PrHistory } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.getHistory(workspaceId, req.params.id, req.log);
      if (result === undefined) throw new NotFoundError('Pull request not found');
      return result;
    },
  );
}
