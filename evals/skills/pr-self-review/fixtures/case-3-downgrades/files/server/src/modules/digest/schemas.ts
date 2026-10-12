+import { z } from 'zod';
+
+export const DigestScheduleInput = z.object({
+  cron: z.string().min(9).max(64),
+  recipients: z.array(z.string().email()).max(20),
+});
+
+export type DigestScheduleInput = z.infer<typeof DigestScheduleInput>;
