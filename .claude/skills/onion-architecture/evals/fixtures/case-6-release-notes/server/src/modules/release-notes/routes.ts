import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ReleaseNotes } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

const TagRange = z.object({
  from: z.string().min(1).max(200),
  to: z.string().min(1).max(200),
});

export default async function releaseNotesRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.releaseNotes;

  app.get(
    '/repos/:id/release-notes',
    { schema: { params: IdParams, querystring: TagRange, response: { 200: ReleaseNotes } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const notes = await service.generate(workspaceId, req.params.id, req.query.from, req.query.to);
      if (!notes) throw new NotFoundError('Repo not found');
      return notes;
    },
  );
}
