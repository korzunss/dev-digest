import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ReviewForecast } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

export default async function reviewForecastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.reviewForecast;

  app.get(
    '/pulls/:id/forecast',
    { schema: { params: IdParams, response: { 200: ReviewForecast } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const forecast = await service.forecast(workspaceId, req.params.id, req.log);
      if (!forecast) throw new NotFoundError('Pull request not found');
      return forecast;
    },
  );
}
