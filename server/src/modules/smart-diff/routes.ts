import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SmartDiffResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * Smart Diff module (spec 007) — reviewer-ordered Files-changed grouping.
 *   GET /pulls/:id/smart-diff → SmartDiffResponse
 *
 * `finding_lines` reflects only the latest `kind='review'` review's
 * undismissed findings (D3/D4). Workspace scoping is enforced by
 * `getContext` + `SmartDiffService.get`, never by a client-supplied value.
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.smartDiff;

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams, response: { 200: SmartDiffResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.get(workspaceId, req.params.id);
      if (result === undefined) throw new NotFoundError('Pull request not found');
      return result;
    },
  );
}
