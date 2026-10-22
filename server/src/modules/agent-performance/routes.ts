import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  AgentPerfDashboard,
  AgentPerfStats,
  AgentStatsBreakdown,
  PerfQuery,
  PerfRunsCount,
  PerfRunsCountQuery,
  RunHistoryPage,
  RunHistoryQuery,
} from '@devdigest/shared/contracts/agent-performance.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Agent Performance routes (spec 015, plan 42). Read-only: handlers resolve the
 * workspace and call `AgentPerformanceService`. The static `/agents/performance`
 * paths win over the parametric `/agents/:id` in find-my-way, so they never reach
 * the agents module's UUID params check.
 */
export default async function agentPerformanceRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/agents/performance',
    { schema: { querystring: PerfQuery, response: { 200: AgentPerfDashboard } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return app.container.agentPerformance.dashboard(workspaceId, req.query);
    },
  );

  app.get(
    '/agents/performance/runs-count',
    { schema: { querystring: PerfRunsCountQuery, response: { 200: PerfRunsCount } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return app.container.agentPerformance.runsCount(workspaceId, req.query);
    },
  );

  app.get(
    '/agents/:id/stats',
    { schema: { params: IdParams, querystring: PerfQuery, response: { 200: AgentPerfStats } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return app.container.agentPerformance.agentStats(workspaceId, req.params.id, req.query);
    },
  );

  app.get(
    '/agents/:id/stats/breakdown',
    { schema: { params: IdParams, querystring: PerfQuery, response: { 200: AgentStatsBreakdown } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return app.container.agentPerformance.breakdown(workspaceId, req.params.id, req.query);
    },
  );

  app.get(
    '/agents/:id/stats/runs',
    { schema: { params: IdParams, querystring: RunHistoryQuery, response: { 200: RunHistoryPage } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return app.container.agentPerformance.runHistory(workspaceId, req.params.id, req.query);
    },
  );
}
