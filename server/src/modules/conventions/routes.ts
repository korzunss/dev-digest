import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ConventionCategory,
  ConventionSkillPreview,
  ConventionStatus,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module — the house rules a repo already follows (spec 004).
 *   POST  /repos/:id/conventions/extract       → 201 ConventionScanResult
 *   GET   /repos/:id/conventions               → 200 ConventionScanResult (latest scan)
 *   PATCH /conventions/:id                     → 200 ConventionCandidate
 *   POST  /repos/:id/conventions/skill/preview → 200 ConventionSkillPreview[]
 *   POST  /repos/:id/conventions/skill         → 201 Skill[]
 *
 * The preview/commit split copies `POST /skills/import/preview`: nothing is
 * persisted until the user confirms, so abandoning the modal leaves no row to
 * clean up. The commit endpoint re-derives the accepted set server-side, which
 * is why "a rejected rule reaches no skill" holds even for a hand-made request.
 */

const UpdateConventionBody = z.object({
  rule: z.string().min(1).optional(),
  category: ConventionCategory.optional(),
  status: ConventionStatus.optional(),
});

// A body-less POST has to be legal here — the client's `api.post` omits the
// body entirely when there is nothing to send. `.default({})` does NOT buy that:
// Fastify hands a missing body to the validator as `null`, and a Zod default
// only fires on `undefined`, so the route answered 422 "Expected object,
// received null". Accepting nullish and collapsing it is what actually works.
const PreviewSkillBody = z
  .object({ split: z.boolean().optional() })
  .nullish()
  .transform((body) => body ?? {});

/**
 * The confirmed previews, each carrying the candidates it was built from.
 * `candidate_ids` sits per skill rather than once at the top level because a
 * split produces disjoint sets — one per category — and a shared list could not
 * say which skill consumed which rule.
 */
const CreateSkillBody = z.object({
  skills: z
    .array(ConventionSkillPreview.extend({ enabled: z.boolean().optional() }))
    .min(1),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  // Rate-limited like `POST /pulls/:id/review`: one press is one model call
  // over ~15 whole files, and Re-scan is a button somebody will lean on.
  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.extract(workspaceId, req.params.id, req.log);
      if (result === undefined) throw new NotFoundError('Repo not found');
      reply.status(201);
      return result;
    },
  );

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const result = await service.latest(workspaceId, req.params.id);
    if (result === undefined) throw new NotFoundError('Repo not found');
    return result;
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const candidate = await service.updateCandidate(workspaceId, req.params.id, req.body);
      if (!candidate) throw new NotFoundError('Convention not found');
      return candidate;
    },
  );

  app.post(
    '/repos/:id/conventions/skill/preview',
    { schema: { params: IdParams, body: PreviewSkillBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const previews = await service.preview(
        workspaceId,
        req.params.id,
        req.body.split ?? false,
      );
      if (previews === undefined) throw new NotFoundError('Repo not found');
      return previews;
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateSkillBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      // A candidate that is not accepted is a 422 from the service, never a
      // silently skipped entry: the caller asked for something it may not have.
      const skills = await service.createSkills(workspaceId, req.params.id, req.body.skills);
      if (skills === undefined) throw new NotFoundError('Repo not found');
      reply.status(201);
      return skills;
    },
  );
}
