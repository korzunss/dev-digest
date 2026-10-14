 import type { FastifyInstance } from 'fastify';
 import type { ZodTypeProvider } from 'fastify-type-provider-zod';
 import { getContext } from '../_shared/context.js';
 import { IdParams } from '../_shared/schemas.js';
 import { DigestService } from './service.js';
 
 export default async function digestRoutes(appBase: FastifyInstance) {
   const app = appBase.withTypeProvider<ZodTypeProvider>();
   const service = new DigestService(app.container);
 
   app.get('/digest/:id', { schema: { params: IdParams } }, async (req) => {
     const { workspaceId } = await getContext(app.container, req);
     return service.get(workspaceId, req.params.id);
   });
 
   app.delete('/digest/:id', async (req, reply) => {
     const { workspaceId } = await getContext(app.container, req);
     await service.remove(workspaceId, (req.params as { id: string }).id);
     return reply.status(204).send();
   });
+
+  app.put('/digest/:id/schedule', { schema: { params: IdParams } }, async (req, reply) => {
+    const { workspaceId } = await getContext(app.container, req);
+    const schedule = req.body as { cron: string; recipients: string[] };
+    await service.saveSchedule(workspaceId, req.params.id, schedule);
+    return reply.status(204).send();
+  });
 }
