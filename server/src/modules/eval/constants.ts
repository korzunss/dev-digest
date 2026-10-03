/** Replay/eval gate thresholds (plan 10, D8/D9/D10). */

/** Mean suite recall may drop by at most this many planted issues. */
export const RECALL_GATE_SLACK_ISSUES = 0.5;
/** Mean false CRITICALs must be at most this fraction of the baseline. */
export const FALSE_CRITICALS_GATE_RATIO = 0.5;
/** Mean cost per round must be at most this multiple of the baseline. */
export const COST_GATE_RATIO = 1.25;
/** Upper bound for `--runs` / `rounds`. */
export const MAX_EVAL_ROUNDS = 20;
/** Cap on the failure reason a replay job reports in its progress line. */
export const REPLAY_ERROR_MAX_CHARS = 200;
