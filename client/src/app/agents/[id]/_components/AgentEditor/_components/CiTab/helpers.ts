/* Pure helpers for the CI tab. */
import type { CiFailOn, CiInstallationView, CiRunStatus } from "@devdigest/shared";

/** Closed set, mirrored locally: the client takes no value imports from shared. */
export const CI_FAIL_ON_VALUES: readonly CiFailOn[] = ["never", "critical", "warning", "any"];

/** "Active in N repos" counts only installations whose export PR is merged and repo is connected (AC-63). */
export function activeCount(installations: readonly CiInstallationView[]): number {
  return installations.filter((i) => i.state === "active").length;
}

export type StatusTone = "ok" | "warn" | "crit";

export function statusTone(status: CiRunStatus): StatusTone {
  return status === "passed" ? "ok" : status === "gate_failed" ? "warn" : "crit";
}

/** Whether the repo still runs a gate different from the agent's current one (AC-36). */
export function gateDriftOf(
  installation: Pick<CiInstallationView, "gate_drift" | "exported_ci_fail_on">,
  current: CiFailOn,
): { exported: CiFailOn; current: CiFailOn } | null {
  if (!installation.gate_drift || !installation.exported_ci_fail_on) return null;
  return { exported: installation.exported_ci_fail_on, current };
}
