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

/** Eval pipeline (plan 34) limits. */
/** Title part of a prefilled case name, cut at a hyphen. */
export const EVAL_NAME_TITLE_MAX = 48;
/** Largest accepted case diff (bytes, UTF-8). */
export const EVAL_MAX_DIFF_BYTES = 262_144;
/** Cases per agent suite. */
export const EVAL_MAX_SUITE_CASES = 200;
/** Cases of one suite run in flight at once. */
export const EVAL_CASE_CONCURRENCY = 3;
/** Rows in the dashboard's recent-runs list. */
export const EVAL_RECENT_RUNS = 20;
/** How long a draft run's result can be attached at Save (assumption). */
export const EVAL_DRAFT_TOKEN_TTL_MS = 3_600_000;
/** Deadline of one case's model call (assumption). */
export const EVAL_CASE_CALL_DEADLINE_MS = 240_000;
