/** Wide enough for the diff textarea beside its preview. */
export const MODAL_WIDTH = 880;

export const INPUT_TABS = ["diff", "files", "prMeta"] as const;
export type InputTab = (typeof INPUT_TABS)[number];

export const DIFF_ROWS = 12;
export const EXPECTED_ROWS = 9;

/** Where a saved case is listed: the agent's Evals tab. */
export const evalsTabHref = (agentId: string) => `/agents/${agentId}?tab=evals`;
