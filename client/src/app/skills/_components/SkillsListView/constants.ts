/** Constants for the Skills list view. */

/** Card grid template (responsive auto-fill) — same rhythm as the Agents list. */
export const CARD_GRID_COLS = "repeat(auto-fill, minmax(280px, 1fr))";

/** Placeholder cards while the list loads. Six rather than the Agents list's
    three: a skill card is shorter, so three leave most of the grid blank. */
export const SKELETON_COUNT = 6;

/** Roughly a real card with its meta row and stats footer. */
export const SKELETON_HEIGHT = 150;
