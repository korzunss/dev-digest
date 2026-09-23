import type { Skill } from "@devdigest/shared";
import { NO_VALUE } from "./constants";

/**
 * A skill needs vetting when its body came from outside this workspace. Only a
 * skill written here is trusted on sight; everything else is somebody else's
 * instructions waiting to be read into an agent's prompt.
 */
export function needsVetting(skill: Pick<Skill, "source">): boolean {
  return skill.source !== "manual";
}

/**
 * The card's rollups are nullish on purpose, and the distinction is the whole
 * point of these two helpers: "no run has ever pulled this skill" is a
 * different statement from "it was pulled and nothing was accepted". Rendering
 * the first as `0%` would report a measurement that was never taken.
 */
export function formatCount(value: number | null | undefined): string {
  return value == null ? NO_VALUE : value.toLocaleString("en-US");
}

/** A 0..1 rate as a whole percentage, or an em dash when it was not measured. */
export function formatRate(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NO_VALUE;
  return `${Math.round(value * 100)}%`;
}
