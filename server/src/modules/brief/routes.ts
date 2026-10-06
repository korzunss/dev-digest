import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBriefView } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * PR Brief module (spec 010).
 *   GET  /pulls/:id/brief  -> PrBriefView (stored brief, never calls the model)
 *   POST /pulls/:id/brief  -> PrBriefView (generates; a failure is in `failure`, not a 500)
 *
 * 404 only for a PR that is not in this workspace.
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefView } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const view = await app.container.brief.getView(workspaceId, req.params.id);
      if (view === undefined) throw new NotFoundError('Pull request not found');
      return view;
    },
  );

  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 200: PrBriefView } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const view = await app.container.brief.generate(workspaceId, req.params.id, req.log);
      if (view === undefined) throw new NotFoundError('Pull request not found');
      return view;
    },
  );
}
