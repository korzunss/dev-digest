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
+  async saveSchedule(workspaceId: string, id: string, cron: string, recipients: string[]) {
+    await this.repo.upsertSchedule(workspaceId, id, cron);
+    for (const email of recipients) {
+      await this.repo.addRecipient(workspaceId, id, email);
+    }
+  }
 }
