/** Direction of a delta, for the arrow and its colour. Zero and null are "flat". */
export type DeltaDir = "up" | "down" | "flat";

export const deltaDir = (d: number | null | undefined): DeltaDir => (d == null || d === 0 ? "flat" : d > 0 ? "up" : "down");

/** A 0..1 metric delta as whole percentage points (absolute); the arrow carries the sign. */
export const deltaPoints = (d: number): number => Math.abs(Math.round(d * 100));

/** Skills to name in the promote confirm: `name vN`. */
export const skillLabel = (s: { name: string; version: number }): string => `${s.name} v${s.version}`;
