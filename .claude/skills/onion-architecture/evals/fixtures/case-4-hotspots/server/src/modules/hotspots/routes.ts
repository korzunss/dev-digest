import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Hotspots — files that change often and sit high in the import graph.
 *   GET /repos/:id/hotspots → 200 Hotspot[]
 */
export default async function hotspotsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get('/repos/:id/hotspots', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return container.hotspots.list(workspaceId, req.params.id);
  });
}
