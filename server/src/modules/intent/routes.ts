import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrIntentRecord, PrIntentResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * Intent module (spec 006) — PR intent classification + persistence.
 *   GET  /pulls/:id/intent           → PrIntentResponse (null intent when never classified)
 *   POST /pulls/:id/intent/classify  → PrIntentRecord (always recomputes, D4-A manual path)
 *
 * A missing OpenRouter/feature-model key surfaces as the existing
 * ConfigError/ExternalServiceError from `container.llm`/`container.forge` —
 * this route does not catch provider errors, only "PR not in this workspace".
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.intent;

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: PrIntentResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.get(workspaceId, req.params.id);
      if (result === undefined) throw new NotFoundError('Pull request not found');
      return result;
    },
  );

  app.post(
    '/pulls/:id/intent/classify',
    {
      schema: { params: IdParams, response: { 200: PrIntentRecord } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const record = await service.classify(workspaceId, req.params.id, { logger: req.log });
      if (record === undefined) throw new NotFoundError('Pull request not found');
      return record;
    },
  );
}
