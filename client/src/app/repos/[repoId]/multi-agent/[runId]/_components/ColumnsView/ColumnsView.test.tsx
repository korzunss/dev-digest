/* ColumnsView — AC-28, 33, 34, 35, 38, 39, 44. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentColumn } from "@devdigest/shared";
import runs from "../../../../../../../../messages/en/runs.json";
import { ColumnsView } from "./ColumnsView";

afterEach(cleanup);

const finding = (over: Record<string, unknown>) => ({
  id: "f1",
  severity: "CRITICAL",
  title: "Hardcoded key",
  file: "src/config.ts",
  start_line: 12,
  end_line: null,
  group_id: null,
  also_flagged_by: [],
  ...over,
});
const column = (over: Record<string, unknown>) =>
  ({
    run_id: "r1",
    agent_id: "a1",
    agent_name: "Security",
    agent_deleted: false,
    status: "done",
    error: null,
    score: 38,
    duration_ms: 8200,
    cost_usd: 0.06,
    cost_source: null,
    findings: [],
    ...over,
  }) as unknown as AgentColumn;

function renderIt(columns: AgentColumn[], onViewTrace = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <ColumnsView columns={columns} onViewTrace={onViewTrace} />
    </NextIntlClientProvider>,
  );
  return onViewTrace;
}

describe("ColumnsView", () => {
  it("shows a done column with its findings, also-flagged-by marker, count and trace action", () => {
    const onViewTrace = renderIt([
      column({
        findings: [finding({ also_flagged_by: ["r2"] }), finding({ id: "f2", severity: "WARNING", title: "Retry-After", start_line: 52 })],
      }),
      column({ run_id: "r2", agent_name: "Performance", score: 64 }),
    ]);
    const sec = within(screen.getByRole("region", { name: "Security" }));
    expect(sec.getByText("Hardcoded key")).toBeTruthy();
    expect(sec.getByText("Critical")).toBeTruthy();
    expect(sec.getByText("src/config.ts:12")).toBeTruthy();
    expect(sec.getByText("also flagged by Performance")).toBeTruthy();
    expect(sec.getByText("2 findings")).toBeTruthy();
    expect(sec.getByText("done · 8.2s · $0.06")).toBeTruthy();
    fireEvent.click(sec.getByText("View trace"));
    expect(onViewTrace).toHaveBeenCalledWith("r1");
  });

  it("shows an empty ring with the status and the failure reason when there is no score", () => {
    renderIt([column({ status: "failed", score: null, error: "model call failed" })]);
    expect(screen.getByTestId("empty-score-ring").textContent).toBe("failed");
    expect(screen.getByText("model call failed")).toBeTruthy();
  });

  it("labels a deleted agent and a running column", () => {
    renderIt([
      column({ agent_name: null, agent_deleted: true, agent_id: null }),
      column({ run_id: "r3", agent_name: "Style", status: "running", score: null, duration_ms: null, cost_usd: null }),
    ]);
    expect(screen.getByRole("region", { name: "Deleted agent" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Style" })).getByTestId("empty-score-ring").textContent).toBe("running");
    expect(screen.getAllByText("No findings.")).toHaveLength(1);
  });
});
