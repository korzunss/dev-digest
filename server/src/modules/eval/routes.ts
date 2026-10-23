import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  EvalAgentDetail,
  EvalCaseRunBody,
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
  EvalSkillDraftRunBody,
  EvalSkillRunAgentsPreview,
  EvalSkillRunBody,
  EvalSkillRunState,
  EvalSuiteCase,
  EvalSuiteRun,
  EvalSuiteRunDetail,
} from '@devdigest/shared';
import { EvalSkillSuiteCase } from '@devdigest/shared/contracts/skill-scope.js';
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
 * Skill suites (plan 35; a skill case carries a provider/model pick):
 *   GET    /skills/:id/eval-cases            -> EvalSkillSuiteCase[]
 *   POST   /skills/:id/eval-cases            -> 201 EvalSkillSuiteCase
 *   POST   /skills/:id/eval-draft-runs (paid)-> EvalDraftRunResult
 *   POST   /skills/:id/eval-runs  (paid)     -> 202 EvalSkillRunState
 *   GET    /skills/:id/eval-run              -> EvalSkillRunState
 *   GET    /skills/:id/eval-run-agents       -> EvalSkillRunAgentsPreview
 *   POST   /skills/:id/eval-run-agents (paid)-> EvalRunAllResult
 *   POST   /eval-cases/:id/runs takes an optional EvalCaseRunBody (required for a skill case)
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
  const skillSuite = () => app.container.evalSkillSuite;

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
    // The body is optional (an absent body reaches the schema as null, hence nullish): an agent case runs on the agent's own model (an unguessable
    // case id, kept bodyless); a skill case needs the pick and the service refuses without it.
    { schema: { params: IdParams, body: EvalCaseRunBody.nullish(), response: { 200: EvalSuiteCase } }, config: RATE_LIMIT },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return evalPipeline().runSavedCase(workspaceId, req.params.id, req.body ?? undefined);
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

  // ---- Skill suites ------------------------------------------------------
  app.get(
    '/skills/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalSkillSuiteCase) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return skillSuite().listCases(workspaceId, req.params.id);
    },
  );

  app.post(
    '/skills/:id/eval-cases',
    { schema: { params: IdParams, body: EvalCaseSaveBody, response: { 201: EvalSkillSuiteCase } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const created = await skillSuite().createCase(workspaceId, req.params.id, req.body);
      return reply.status(201).send(created);
    },
  );

  app.post(
    '/skills/:id/eval-draft-runs',
    {
      schema: { params: IdParams, body: EvalSkillDraftRunBody, response: { 200: EvalDraftRunResult } },
      config: RATE_LIMIT,
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return skillSuite().draftRun(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/skills/:id/eval-runs',
    // A required JSON body (pick + confirm): a cross-origin no-cors POST cannot carry one.
    {
      schema: { params: IdParams, body: EvalSkillRunBody, response: { 202: EvalSkillRunState } },
      config: RATE_LIMIT,
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const { provider, model } = req.body;
      const state = await skillSuite().startSuiteRun(workspaceId, req.params.id, { provider, model });
      return reply.status(202).send(state);
    },
  );

  app.get(
    '/skills/:id/eval-run',
    { schema: { params: IdParams, response: { 200: EvalSkillRunState } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return skillSuite().runState(workspaceId, req.params.id);
    },
  );

  app.get(
    '/skills/:id/eval-run-agents',
    { schema: { params: IdParams, response: { 200: EvalSkillRunAgentsPreview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return evalPipeline().runOnEvalsPreview(workspaceId, req.params.id);
    },
  );

  app.post(
    '/skills/:id/eval-run-agents',
    { schema: { params: IdParams, body: EvalRunAllBody, response: { 200: EvalRunAllResult } }, config: RATE_LIMIT },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return evalPipeline().runOnEvals(workspaceId, req.params.id);
    },
  );
}
