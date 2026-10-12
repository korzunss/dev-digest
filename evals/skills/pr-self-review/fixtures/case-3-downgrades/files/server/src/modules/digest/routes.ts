 import type { FastifyInstance } from 'fastify';
 import type { ZodTypeProvider } from 'fastify-type-provider-zod';
 import { getContext } from '../_shared/context.js';
 import { IdParams } from '../_shared/schemas.js';
+import { DigestScheduleInput } from './schemas.js';
 import { DigestService } from './service.js';
 
 export default async function digestRoutes(appBase: FastifyInstance) {
   const app = appBase.withTypeProvider<ZodTypeProvider>();
   const service = new DigestService(app.container);
 
   app.get('/digest/:id', { schema: { params: IdParams } }, async (req) => {
     const { workspaceId } = await getContext(app.container, req);
     return service.get(workspaceId, req.params.id);
   });
+
+  app.put(
+    '/digest/:id/schedule',
+    { schema: { params: IdParams, body: DigestScheduleInput } },
+    async (req, reply) => {
+      const { workspaceId } = await getContext(app.container, req);
+      await service.saveSchedule(workspaceId, req.params.id, req.body.cron, req.body.recipients);
+      return reply.status(204).send();
+    },
+  );
 }
