import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CiInstallInput,
  CiInstallationView,
  CiInstallResult,
  CiPreview,
  CiPreviewInput,
  CiRefreshInput,
  CiRefreshResult,
  CiRunsPage,
  CiRunsQuery,
  CiValidateWorkflowInput,
  CiWorkflowCheck,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Export-to-CI routes (plan 40, DN1). Handlers only resolve the workspace and
 * call `CiService`. The two mutating routes that spend GitHub quota are rate
 * limited; `POST /ci/refresh` takes an object body so a bodyless cross-site
 * POST is refused (server gotchas → Security).
 */
export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/agents/:id/ci/preview',
    { schema: { params: IdParams, body: CiPreviewInput, response: { 200: CiPreview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return app.container.ci.preview(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/agents/:id/ci/validate-workflow',
    { schema: { params: IdParams, body: CiValidateWorkflowInput, response: { 200: CiWorkflowCheck } } },
    async (req) => {
      await getContext(app.container, req);
      return app.container.ci.validateWorkflow(req.body);
    },
  );

  app.post(
    '/agents/:id/ci/install',
    {
      schema: { params: IdParams, body: CiInstallInput, response: { 200: CiInstallResult } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return app.container.ci.install(workspaceId, req.params.id, req.body);
    },
  );

  app.get(
    '/agents/:id/ci/installations',
    { schema: { params: IdParams, response: { 200: z.array(CiInstallationView) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return app.container.ci.listInstallations(workspaceId, req.params.id);
    },
  );

  app.delete(
    '/ci/installations/:id',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      await app.container.ci.remove(workspaceId, req.params.id);
      return reply.status(204).send();
    },
  );

  app.post(
    '/ci/refresh',
    {
      schema: { body: CiRefreshInput, response: { 200: CiRefreshResult } },
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return app.container.ci.refresh(workspaceId, req.body.agent_id);
    },
  );

  app.get(
    '/ci/runs',
    { schema: { querystring: CiRunsQuery, response: { 200: CiRunsPage } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return app.container.ci.listRuns(workspaceId, req.query);
    },
  );
}
