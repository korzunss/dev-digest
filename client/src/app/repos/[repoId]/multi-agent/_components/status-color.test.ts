import { describe, it, expect } from "vitest";
import type { MultiAgentOverallStatus } from "@devdigest/shared";
import { statusColor } from "./status-color";

describe("statusColor", () => {
  it("maps each known status to its own colour pair", () => {
    const statuses: MultiAgentOverallStatus[] = ["running", "done", "partially_failed", "failed"];
    const pairs = statuses.map((st) => statusColor(st));
    for (const p of pairs) {
      expect(p.color).toMatch(/^var\(--/);
      expect(p.bg).toMatch(/^var\(--/);
    }
    expect(new Set(pairs.map((p) => p.color)).size).toBe(4);
  });

  // a status from a newer server falls back to the neutral pair instead of throwing (PR2-C3)
  it("falls back to the neutral pair for an unknown status", () => {
    const { color, bg } = statusColor("cancelled" as unknown as MultiAgentOverallStatus);
    expect(color).toBe("var(--text-muted)");
    expect(bg).toBe("var(--bg-hover)");
  });
});
