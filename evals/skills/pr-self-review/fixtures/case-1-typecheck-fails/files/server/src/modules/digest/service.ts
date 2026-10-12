 import type { Container } from '../../platform/container.js';
 import { DigestRepository } from './repository.js';
 
 export class DigestService {
   private readonly repo: DigestRepository;
 
   constructor(container: Container) {
     this.repo = new DigestRepository(container.db);
   }
 
   async get(workspaceId: string, id: string) {
     return this.repo.byId(workspaceId, id);
   }
+
+  async rename(workspaceId: string, id: string, title: string) {
+    const row = await this.repo.byId(workspaceId, id);
+    const trimmed: string = row?.title === title ? undefined : title.trim();
+    return this.repo.updateTitle(workspaceId, id, trimmed);
+  }
 }
