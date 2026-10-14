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
 
   async remove(workspaceId: string, id: string) {
     await this.repo.delete(workspaceId, id);
   }
+
+  async saveSchedule(workspaceId: string, id: string, schedule: { cron: string; recipients: string[] }) {
+    await this.repo.upsertSchedule(workspaceId, id, schedule.cron);
+    for (const email of schedule.recipients) {
+      await this.repo.addRecipient(workspaceId, id, email);
+    }
+  }
 }
