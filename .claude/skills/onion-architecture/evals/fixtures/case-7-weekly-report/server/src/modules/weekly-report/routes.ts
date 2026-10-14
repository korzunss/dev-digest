import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { WeeklyReport } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';

export default async function weeklyReportRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.weeklyReport;

  app.get(
    '/workspace/weekly-report',
    { schema: { response: { 200: WeeklyReport } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.build(workspaceId);
    },
  );
}
