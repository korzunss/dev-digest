import { z } from 'zod';

export const ReviewForecast = z.object({
  prId: z.string().uuid(),
  changedFiles: z.number().int().nonnegative(),
  downstreamFiles: z.number().int().nonnegative(),
  promptTokens: z.number().int().nonnegative(),
  estimatedMinutes: z.number().nonnegative(),
  indexed: z.boolean(),
});
export type ReviewForecast = z.infer<typeof ReviewForecast>;
