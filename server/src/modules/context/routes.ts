import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ContextService } from './service.js';

/**
 * Context module — the project-context documents a repo carries about itself.
 *   GET /repos/:id/context            → SpecFile[]  (listing; content omitted)
 *   GET /repos/:id/context/doc?path=… → SpecFile    (one document, with content)
 *
 * Read straight off the working clone, so a repo that has not been cloned yet
 * lists as empty rather than failing.
 */

const DocQuery = z.object({
  /**
   * Repo-relative path, e.g. `specs/public-api.md`. Validated for SHAPE here
   * and for SAFETY in `resolveDocPath` — a well-formed string is still a
   * traversal attempt until the resolver has had it.
   */
  path: z.string().min(1),
});

export default async function contextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ContextService(app.container);

  app.get('/repos/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const docs = await service.list(workspaceId, req.params.id);
    if (docs === undefined) throw new NotFoundError('Repo not found');
    return docs;
  });

  app.get(
    '/repos/:id/context/doc',
    { schema: { params: IdParams, querystring: DocQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      // A refused path is a 422 from the service, never a 404: see getDoc().
      const doc = await service.getDoc(workspaceId, req.params.id, req.query.path);
      if (doc === undefined) throw new NotFoundError('Repo not found');
      return doc;
    },
  );
}
