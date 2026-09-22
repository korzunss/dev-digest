import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillSource, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { IMPORT_BODY_LIMIT } from './constants.js';
import { SkillsService } from './service.js';

/**
 * Skills module.
 *   GET    /skills                 → list (workspace-scoped)
 *   GET    /skills/:id             → one skill
 *   POST   /skills                 → create
 *   PUT    /skills/:id             → update (a body change bumps the version)
 *   DELETE /skills/:id             → delete (agent links cascade)
 *   GET    /skills/:id/versions    → body history, newest first
 *   GET    /skills/:id/versions/diff?from=&to= → unified diff between two bodies
 *   POST   /skills/:id/versions/:version/restore → re-apply an old body (appends)
 *   GET    /skills/:id/context     → attached project-context documents
 *   PUT    /skills/:id/context     → replace the attached set (ordered)
 *   GET    /skills/:id/stats       → usage figures for the Stats tab
 *   POST   /skills/import/preview  → parse a .md / .zip / URL, storing NOTHING
 */

const CreateSkillBody = z.object({
  name: z.string().min(1),
  // The description is the skill's interface — what an agent reads to decide
  // the rule applies — so it is required, not decorative.
  description: z.string().min(1),
  type: SkillType,
  body: z.string().min(1),
  source: SkillSource.optional(),
  enabled: z.boolean().optional(),
  evidence_files: z.array(z.string()).optional(),
});

/**
 * The import payload is JSON with base64 rather than multipart: the zod type
 * provider cannot validate a multipart body, and schema-first routes are this
 * package's convention — so a file upload would otherwise cost both a new
 * Fastify plugin and a route that opts out of the house style.
 */
const ImportPreviewBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('md'),
    filename: z.string().min(1),
    content: z.string().min(1),
  }),
  z.object({
    kind: z.literal('zip'),
    filename: z.string().min(1),
    content_b64: z.string().min(1),
  }),
  z.object({ kind: z.literal('url'), url: z.string().url() }),
]);

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  type: SkillType.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  /** Recorded on the version a body change creates; ignored otherwise. */
  message: z.string().min(1).optional(),
});

/** `/skills/:id/versions/:version/restore` — version is a positive integer. */
const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

const DiffQuery = z.object({
  from: z.coerce.number().int().positive(),
  to: z.coerce.number().int().positive(),
});

// `.default({})` so a body-less POST is legal: the client's `api.post`
// omits the body entirely when there is no message to send.
const RestoreBody = z.object({ message: z.string().min(1).optional() }).default({});

/** The whole ordered set, like `POST /agents/:id/skills` — order is meaning. */
const SetContextBody = z.object({ paths: z.array(z.string().min(1)) });

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const body = req.body;
    const skill = await service.create(workspaceId, {
      name: body.name,
      description: body.description,
      type: body.type,
      body: body.body,
      ...(body.source !== undefined ? { source: body.source } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.evidence_files !== undefined ? { evidence_files: body.evidence_files } : {}),
    });
    reply.status(201);
    return skill;
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  // A larger body than the 1 MB app default: an archive arrives base64-encoded,
  // which is ~4/3 of its byte size.
  app.post(
    '/skills/import/preview',
    { schema: { body: ImportPreviewBody }, bodyLimit: IMPORT_BODY_LIMIT },
    async (req) => {
      await getContext(app.container, req);
      return service.importPreview(req.body);
    },
  );

  // Registered BEFORE `/skills/:id/versions` would otherwise shadow it — Fastify
  // matches static segments first, but keeping them adjacent makes that visible.
  app.get(
    '/skills/:id/versions/diff',
    { schema: { params: IdParams, querystring: DiffQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const diff = await service.versionDiff(
        workspaceId,
        req.params.id,
        req.query.from,
        req.query.to,
      );
      if (!diff) throw new NotFoundError('Skill not found');
      return diff;
    },
  );

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams, body: RestoreBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restoreVersion(
        workspaceId,
        req.params.id,
        req.params.version,
        req.body.message,
      );
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.get('/skills/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const links = await service.contextLinks(workspaceId, req.params.id);
    if (!links) throw new NotFoundError('Skill not found');
    return links;
  });

  app.put(
    '/skills/:id/context',
    { schema: { params: IdParams, body: SetContextBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const links = await service.setContextLinks(workspaceId, req.params.id, req.body.paths);
      if (!links) throw new NotFoundError('Skill not found');
      return links;
    },
  );

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const stats = await service.stats(workspaceId, req.params.id);
    if (!stats) throw new NotFoundError('Skill not found');
    return stats;
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });
}
