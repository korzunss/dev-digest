import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  EvalAgentDetail,
  EvalCaseSaveBody,
  EvalCompare,
  EvalDashboardView,
  EvalDraftRunBody,
  EvalDraftRunResult,
  EvalDraftSeed,
  EvalPeriod,
  EvalPromoteResult,
  EvalRunAllBody,
  EvalRunAllPreview,
  EvalRunAllResult,
  EvalSuiteCase,
  EvalSuiteRun,
  EvalSuiteRunDetail,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/**
 * Eval pipeline (spec 011): regression suites per agent.
 *   GET    /agents/:id/eval-cases            -> EvalSuiteCase[]
 *   POST   /agents/:id/eval-cases            -> 201 EvalSuiteCase
 *   PUT    /eval-cases/:id                   -> EvalSuiteCase
 *   DELETE /eval-cases/:id                   -> 204
 *   POST   /eval-cases/:id/runs   (paid)     -> EvalSuiteCase
 *   GET    /findings/:id/eval-draft          -> EvalDraftSeed (writes nothing)
 *   POST   /agents/:id/eval-draft-runs (paid)-> EvalDraftRunResult
 *   POST   /agents/:id/eval-runs  (paid)     -> 202 EvalSuiteRun
 *   GET    /agents/:id/eval?period=          -> EvalAgentDetail
 *   GET    /eval-runs/:id                    -> EvalSuiteRunDetail
 *   GET    /eval-runs/compare?a=&b=          -> EvalCompare
 *   POST   /eval-runs/:id/promote (writes)   -> EvalPromoteResult
 *   GET    /eval/dashboard                   -> EvalDashboardView
 *   GET    /eval/run-all                     -> EvalRunAllPreview
 *   POST   /eval/run-all          (paid)     -> EvalRunAllResult
 *
 * Every route is reachable from the LAN (server/insights/gotchas.md, Security),
 * so each one that spends money or writes is rate-limited.
 * Domain refusals are `AppError`s thrown by the service (409 / 422 / 404).
 */
const RATE_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } } as const;

const PeriodQuery = z.object({ period: EvalPeriod.default('30d') });
const CompareQuery = z.object({ a: z.string().uuid(), b: z.string().uuid() });

export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const evalPipeline = () => app.container.evalPipeline;

  // ---- Cases -------------------------------------------------------------
  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalSuiteCase) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return evalPipeline().listCases(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, body: EvalCaseSaveBody, response: { 201: EvalSuiteCase } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const created = await evalPipeline().createCase(workspaceId, req.params.id, req.body);
      return reply.status(201).send(created);
    },
  );

  app.put(
    '/eval-cases/:id',
    { schema: { params: IdParams, body: EvalCaseSaveBody, response: { 200: EvalSuiteCase } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return evalPipeline().updateCase(workspaceId, req.params.id, req.body);
    },
  );

  app.delete('/eval-cases/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const removed = await evalPipeline().deleteCase(workspaceId, req.params.id);
    if (!removed) throw new NotFoundError('Case not found');
    return reply.status(204).send();
  });

  app.post(
    '/eval-cases/:id/runs',
    { schema: { params: IdParams, response: { 200: EvalSuiteCase } }, config: RATE_LIMIT },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return evalPipeline().runSavedCase(workspaceId, req.params.id);
    },
  );

  // ---- Drafts ------------------------------------------------------------
  app.get(
    '/findings/:id/eval-draft',
    { schema: { params: IdParams, response: { 200: EvalDraftSeed } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return evalPipeline().seedDraft(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-draft-runs',
    {
      schema: { params: IdParams, body: EvalDraftRunBody, response: { 200: EvalDraftRunResult } },
      config: RATE_LIMIT,
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return evalPipeline().draftRun(workspaceId, req.params.id, req.body);
    },
  );

  // ---- Suite runs and views ---------------------------------------------
  app.post(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, response: { 202: EvalSuiteRun } }, config: RATE_LIMIT },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const run = await evalPipeline().startSuiteRun(workspaceId, req.params.id);
      return reply.status(202).send(run);
    },
  );

  app.get(
    '/agents/:id/eval',
    { schema: { params: IdParams, querystring: PeriodQuery, response: { 200: EvalAgentDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return evalPipeline().agentDetail(workspaceId, req.params.id, req.query.period);
    },
  );

  // Static `/eval-runs/compare` wins over `/eval-runs/:id` in the router.
  app.get(
    '/eval-runs/compare',
    { schema: { querystring: CompareQuery, response: { 200: EvalCompare } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return evalPipeline().compare(workspaceId, req.query.a, req.query.b);
    },
  );

  app.get(
    '/eval-runs/:id',
    { schema: { params: IdParams, response: { 200: EvalSuiteRunDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return evalPipeline().getRun(workspaceId, req.params.id);
    },
  );

  app.post(
    '/eval-runs/:id/promote',
    { schema: { params: IdParams, response: { 200: EvalPromoteResult } }, config: RATE_LIMIT },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return evalPipeline().promote(workspaceId, req.params.id);
    },
  );

  // ---- Dashboard ---------------------------------------------------------
  app.get('/eval/dashboard', { schema: { response: { 200: EvalDashboardView } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return evalPipeline().dashboard(workspaceId);
  });

  app.get('/eval/run-all', { schema: { response: { 200: EvalRunAllPreview } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return evalPipeline().runAllPreview(workspaceId);
  });

  app.post(
    '/eval/run-all',
    // A required JSON body: a cross-origin no-cors POST (text/plain, form) cannot carry one.
    { schema: { body: EvalRunAllBody, response: { 200: EvalRunAllResult } }, config: RATE_LIMIT },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return evalPipeline().runAll(workspaceId);
    },
  );
}
