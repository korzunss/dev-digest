import type { BriefFailureReason } from '@devdigest/shared';
import { ConfigError } from '../../platform/errors.js';
import { BriefBudgetError } from './budget.js';

/** Map a generation error to the failure the view serves (AC-7/8/45). */
export function classifyBriefError(
  err: unknown,
): Exclude<BriefFailureReason, 'in_progress'> {
  if (err instanceof ConfigError) return 'no_key';
  if (err instanceof BriefBudgetError) return 'over_budget';
  return 'failed';
}
