/** Constants for the agents module. */

/** Initial config version recorded for a newly-created agent. */
export const INITIAL_AGENT_VERSION = 1;

/** Default agent description when none is supplied on insert. */
export const DEFAULT_AGENT_DESCRIPTION = '';

/**
 * Skills `agents:sync-builtin` detaches from General Reviewer: their rules now
 * live in the repo-context block (plan 10, D6), so keeping them attached would
 * state the same rule twice.
 */
export const GENERAL_DETACHED_SKILLS: readonly string[] = [
  'dev-digest-conventions',
  'contract-change-gate',
];

/** Built-in agent that loses `GENERAL_DETACHED_SKILLS` on sync. */
export const GENERAL_AGENT_NAME = 'General Reviewer';
