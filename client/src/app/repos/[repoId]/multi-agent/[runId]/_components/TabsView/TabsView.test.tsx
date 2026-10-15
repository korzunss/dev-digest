/* TabsView — AC-36, 40, 41, 42. FindingCard is the shared one; hooks are mocked
   at their module edge. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentColumn } from "@devdigest/shared";
import runs from "../../../../../../../../messages/en/runs.json";
import prReview from "../../../../../../../../messages/en/prReview.json";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import { ToastProvider } from "@/lib/toast";

const mutate = vi.fn();
vi.mock("@/lib/hooks/multi-agent", () => ({
  useMultiAgentFindingAction: () => ({ mutate, isPending: false }),
}));

import { TabsView } from "./TabsView";

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

const finding = (over: Record<string, unknown>) => ({
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded key",
  file: "src/config.ts",
  start_line: 12,
  end_line: null,
  rationale: "A **live** key. ![x](http://e.test/x.png)",
  suggestion: "Rotate it.",
  confidence: 0.98,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "rv",
  accepted_at: null,
  dismissed_at: null,
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
    summary: "Two **critical** exposures.",
    duration_ms: 8200,
    cost_usd: 0.06,
    cost_source: null,
    findings: [],
    ...over,
  }) as unknown as AgentColumn;

const COLUMNS = [
  column({ findings: [finding({ also_flagged_by: ["r2"] })] }),
  column({ run_id: "r2", agent_name: "Performance", score: 64, summary: null, findings: [] }),
];

function renderIt(onViewTrace = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <NextIntlClientProvider locale="en" messages={{ runs, prReview, eval: evalMessages }}>
          <TabsView runId="m1" columns={COLUMNS} onViewTrace={onViewTrace} />
        </NextIntlClientProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return onViewTrace;
}

describe("TabsView", () => {
  it("shows a tab per agent with its score and the selected agent's summary and findings", () => {
    const onViewTrace = renderIt();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]!.textContent).toContain("Security");
    expect(tabs[0]!.textContent).toContain("38");
    expect(tabs[1]!.textContent).toContain("64");
    expect(screen.getByText("critical")).toBeTruthy(); // summary markdown
    expect(screen.getByText("Hardcoded key")).toBeTruthy();
    expect(screen.getByText("also flagged by Performance")).toBeTruthy();
    expect(screen.queryByText("Learn")).toBeNull();
    expect(screen.queryByText("Reply to author")).toBeNull();
    fireEvent.click(screen.getByText("View trace"));
    expect(onViewTrace).toHaveBeenCalledWith("r1");
  });

  it("expands a finding without any remote image, and accept goes to the action hook", () => {
    renderIt();
    expect(screen.getByText("live")).toBeTruthy();
    expect(screen.getByText("Rotate it.")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(mutate).toHaveBeenCalledWith({ findingId: "f1", action: "accept" });
  });

  it("switching tabs shows that agent's summary fallback and empty findings", () => {
    renderIt();
    fireEvent.click(screen.getAllByRole("tab")[1]!);
    expect(screen.getByText("No summary.")).toBeTruthy();
    expect(screen.getByText("No findings.")).toBeTruthy();
    expect(screen.queryByText("Hardcoded key")).toBeNull();
  });

  it("is a complete tabs pattern: linked ids, roving tabindex and Arrow-key navigation (PR-C4)", () => {
    renderIt();
    const [first, second] = screen.getAllByRole("tab") as [HTMLElement, HTMLElement];
    const panel = screen.getByRole("tabpanel");
    expect(first).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", first.id);
    expect([first.tabIndex, second.tabIndex]).toEqual([0, -1]);
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(second).toHaveFocus();
    expect([first.tabIndex, second.tabIndex]).toEqual([-1, 0]);
    fireEvent.keyDown(second, { key: "ArrowRight" }); // wraps
    expect(first).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(first, { key: "ArrowLeft" }); // wraps back
    expect(second).toHaveAttribute("aria-selected", "true");
  });

  it("spans the full width and the tabs share it, each titled with its full name (AC-41a, 41b)", () => {
    renderIt();
    const tabs = screen.getAllByRole("tab");
    const wrap = screen.getByRole("tablist").parentElement!;
    expect(wrap.style.maxWidth).toBe("");
    expect(wrap.style.width).toBe("100%");
    expect(tabs[0]!.style.flex).toMatch(/^1 1 0/);
    expect(tabs[0]!).toHaveAttribute("title", "Security");
    expect(tabs[1]!).toHaveAttribute("title", "Performance");
  });
});
