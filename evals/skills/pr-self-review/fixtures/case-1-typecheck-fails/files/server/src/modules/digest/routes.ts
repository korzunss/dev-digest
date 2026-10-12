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
+
+  app.post('/digest/:id/title', async (req) => {
+    const { workspaceId } = await getContext(app.container, req);
+    const { id } = req.params as { id: string };
+    const { title } = req.body as { title: string };
+    return service.rename(workspaceId, id, title);
+  });
 }
