import type { MultiAgentOverallStatus } from "@devdigest/shared";

/** Status colour pair, from the same tokens the PR run timeline badges use. */
export function statusColor(status: MultiAgentOverallStatus): { color: string; bg: string } {
  switch (status) {
    case "running":
      return { color: "var(--accent)", bg: "var(--accent-bg)" };
    case "done":
      return { color: "var(--ok)", bg: "var(--ok-bg)" };
    case "partially_failed":
      return { color: "var(--warn)", bg: "var(--warn-bg)" };
    case "failed":
      return { color: "var(--crit)", bg: "var(--crit-bg)" };
    default: {
      // Compile-time exhaustiveness; at runtime an unknown status from a newer
      // server falls back to the neutral pair instead of throwing on destructure.
      const _exhaustive: never = status;
      void _exhaustive;
      return { color: "var(--text-muted)", bg: "var(--bg-hover)" };
    }
  }
}
