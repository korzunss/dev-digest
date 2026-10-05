import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { OnboardingTourView } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { OnboardingService } from './service.js';

/**
 * Onboarding Tour (spec 009).
 *   GET  /repos/:id/onboarding           → 200 OnboardingTourView (never calls the model)
 *   POST /repos/:id/onboarding/generate  → 200 OnboardingTourView, in EVERY case
 *
 * POST answers 200 with the view even when nothing started (a run is already in
 * flight, the repo is not cloned): the reason is visible in `view.generating` /
 * `view.clone.state`, which a 409 body could not carry through the client's
 * `api.post` (it throws on non-2xx). Only an unknown repo is a 404. No body
 * schema: a body-less POST would answer 422 (see conventions/routes.ts).
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new OnboardingService(app.container);

  app.get(
    '/repos/:id/onboarding',
    { schema: { params: IdParams, response: { 200: OnboardingTourView } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const view = await service.getView(workspaceId, req.params.id);
      if (!view) throw new NotFoundError('Repo not found');
      return view;
    },
  );

  // One press is one paid model call over the repo's facts, and the API is
  // LAN-reachable: rate-limit like the conventions extractor.
  app.post(
    '/repos/:id/onboarding/generate',
    {
      schema: { params: IdParams, response: { 200: OnboardingTourView } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const view = await service.generate(workspaceId, req.params.id, req.log);
      if (!view) throw new NotFoundError('Repo not found');
      return view;
    },
  );
}
