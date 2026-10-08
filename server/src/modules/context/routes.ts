import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ContextDocPath, SetContextRootsBody } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * Context module — the project-context documents a repo carries about itself.
 *   GET    /repos/:id/context            → ContextListing (content omitted)
 *   GET    /repos/:id/context/doc?path=… → SpecFile (one document, with content)
 *   GET    /repos/:id/context/roots      → ContextRoots
 *   PUT    /repos/:id/context/roots      → ContextRoots (replace the search-root globs)
 *   DELETE /repos/:id/context/roots      → ContextRoots (reset to the default)
 *
 * Read straight off the working clone, so a repo that has not been cloned yet
 * lists as empty rather than failing.
 */

const DocQuery = z.object({
  /**
   * Repo-relative path, e.g. `specs/public-api.md`. Validated for SHAPE here
   * (the shared `ContextDocPath`: bounded to 512 characters, so an unbounded
   * query string never reaches the guard) and for SAFETY in the service's single
   * path guard — a well-formed string is still a traversal attempt until the
   * guard has had it.
   */
  path: ContextDocPath,
});

export default async function contextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.context;

  app.get('/repos/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const listing = await service.list(workspaceId, req.params.id);
    if (listing === undefined) throw new NotFoundError('Repo not found');
    return listing;
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

  app.get('/repos/:id/context/roots', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const roots = await service.getRoots(workspaceId, req.params.id);
    if (roots === undefined) throw new NotFoundError('Repo not found');
    return roots;
  });

  app.put(
    '/repos/:id/context/roots',
    { schema: { params: IdParams, body: SetContextRootsBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const roots = await service.setRoots(workspaceId, req.params.id, req.body.globs);
      if (roots === undefined) throw new NotFoundError('Repo not found');
      return roots;
    },
  );

  app.delete('/repos/:id/context/roots', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const roots = await service.resetRoots(workspaceId, req.params.id);
    if (roots === undefined) throw new NotFoundError('Repo not found');
    return roots;
  });
}
