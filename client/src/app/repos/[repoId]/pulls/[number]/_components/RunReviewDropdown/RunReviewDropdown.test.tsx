/* AC-1 … AC-8 of spec 013 — the PR-page picker, through the real panel.
   `fireEvent`, not `userEvent` (client/INSIGHTS.md). */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const push = vi.fn();
const runAll = vi.fn().mockResolvedValue({ runs: [{ run_id: "r1" }] });
const startMulti = vi.fn().mockResolvedValue({ id: "m1" });
let startPending = false;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useParams: () => ({ repoId: "repo1", number: "7" }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgents: () => ({
    data: [
      { id: "a1", name: "Security", model: "gpt-4.1", enabled: true },
      { id: "a2", name: "Style", model: "gpt-4.1", enabled: true },
      { id: "a3", name: "Docs", model: "gpt-4.1", enabled: false },
    ],
  }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync: runAll, isPending: false }),
}));
vi.mock("@/lib/hooks/multi-agent", () => ({
  useAgentEstimates: () => ({
    data: [{ agent_id: "a1", duration_ms: 42000, cost_usd: 0.03, sample_size: 3, last_verdict: null }],
  }),
  useStartMultiAgentRun: () => ({ mutateAsync: startMulti, isPending: startPending }),
}));

import { ApiError } from "@/lib/api";
import { RunReviewDropdown } from "./RunReviewDropdown";

beforeEach(() => {
  vi.clearAllMocks();
  startPending = false;
});
afterEach(cleanup);

function open(props: Partial<React.ComponentProps<typeof RunReviewDropdown>> = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunReviewDropdown prId="pr1" {...props} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByText("Run Review"));
}

describe("RunReviewDropdown", () => {
  it("disables the multi-agent start while one is in flight, so it cannot start twice (PR-H2)", () => {
    const tree = () => (
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <RunReviewDropdown prId="pr1" />
      </NextIntlClientProvider>
    );
    const { rerender } = render(tree());
    fireEvent.click(screen.getByText("Run Review"));
    startPending = true; // the start was fired from the open panel
    rerender(tree());
    const btn = screen.getByText("Run multi-agent review (2)").closest("button")!;
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(startMulti).not.toHaveBeenCalled();
  });

  it("shows the picker with estimates, ticks enabled agents only, and starts a multi-agent run", async () => {
    open();
    // AC-1
    expect(screen.getByText("Pick agents to run")).toBeInTheDocument();
    expect(screen.getByText("~42s")).toBeInTheDocument();
    expect(screen.getAllByText("no estimate yet")).toHaveLength(2);
    expect(screen.getByText("Clear")).toBeInTheDocument();
    expect(screen.getByText("Configure agents…")).toBeInTheDocument();
    // AC-2 + AC-5
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.map((b) => b.getAttribute("aria-checked"))).toEqual(["true", "true", "false"]);
    const runBtn = screen.getByRole("button", { name: "Run multi-agent review (2)" });
    // untick one
    fireEvent.click(boxes[1]!);
    expect(screen.getByRole("button", { name: "Run multi-agent review (1)" })).toBeEnabled();
    // AC-3 + AC-4
    fireEvent.click(screen.getByText("Clear"));
    expect(screen.getByRole("button", { name: "Run multi-agent review (0)" })).toBeDisabled();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    // AC-6
    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (1)" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/repos/repo1/multi-agent/m1"));
    expect(startMulti).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1"] });
    expect(runBtn).toBeDefined();
  });

  it("shows an error and does not navigate when the multi-agent start fails", async () => {
    startMulti.mockRejectedValueOnce(new ApiError("Agent not found", 404));
    open();
    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (2)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Agent not found");
    expect(push).not.toHaveBeenCalled();
    // the panel stays open with the selection intact
    expect(screen.getByRole("button", { name: "Run multi-agent review (2)" })).toBeInTheDocument();
  });

  it("falls back to a generic message for a non-API failure", async () => {
    startMulti.mockRejectedValueOnce(new Error("boom"));
    open();
    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (2)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not start the multi-agent review");
  });

  it("re-seeds the selection every time the panel opens (AC-2)", () => {
    open();
    fireEvent.click(screen.getByText("Clear"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("Pick agents to run")).toBeNull();
    fireEvent.click(screen.getByText("Run Review"));
    expect(screen.getByRole("button", { name: "Run multi-agent review (2)" })).toBeInTheDocument();
  });

  it("opens Configure run with this PR (AC-7) and keeps run-all and single-agent runs unlinked (AC-8)", async () => {
    open();
    fireEvent.click(screen.getByText("Configure agents…"));
    expect(push).toHaveBeenCalledWith("/repos/repo1/multi-agent?pr=7");

    fireEvent.click(screen.getByText("Run Review"));
    fireEvent.click(screen.getByText("Run all enabled agents"));
    await waitFor(() => expect(runAll).toHaveBeenCalledWith({ prId: "pr1", all: true }));

    fireEvent.click(screen.getByText("Run Review"));
    fireEvent.click(screen.getByRole("button", { name: "Run only Docs" }));
    await waitFor(() => expect(runAll).toHaveBeenCalledWith({ prId: "pr1", agentId: "a3" }));
    expect(startMulti).not.toHaveBeenCalled();
  });

  it("closes on an outside click", () => {
    open();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Pick agents to run")).toBeNull();
  });

  // focus leaving the portalled panel for an unrelated element closes it, and the element keeps focus (PR2-C1)
  it("closes when focus moves to an element outside the panel and the trigger", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <button type="button">elsewhere</button>
        <RunReviewDropdown prId="pr1" />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByText("Run Review"));
    const panel = screen.getByRole("dialog");
    const outside = screen.getByRole("button", { name: "elsewhere" });
    outside.focus();
    fireEvent.focusOut(panel, { relatedTarget: outside });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(outside).toHaveFocus();
  });

  // focus staying within the panel, or going to the trigger, does not close it (PR2-C1)
  it("stays open while focus moves inside the panel or onto the trigger", () => {
    open();
    const panel = screen.getByRole("dialog");
    const inside = screen.getByText("Clear");
    fireEvent.focusOut(panel, { relatedTarget: inside });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const trigger = screen.getByText("Run Review").closest("button")!;
    fireEvent.focusOut(panel, { relatedTarget: trigger });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // browser chrome (no relatedTarget) is not "another element" either
    fireEvent.focusOut(panel, { relatedTarget: null });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  // a start closes the panel while the trigger is busy/disabled; focus lands on the trigger once it is free again (PR2-C1)
  it("returns focus to the trigger after closing for a start, once it is no longer busy", () => {
    const tree = () => (
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <RunReviewDropdown prId="pr1" />
      </NextIntlClientProvider>
    );
    const view = render(tree());
    fireEvent.click(screen.getByText("Run Review"));
    startPending = true;
    view.rerender(tree());
    fireEvent.click(screen.getByText("Configure agents…")); // closes via close()
    expect(screen.queryByRole("dialog")).toBeNull();
    startPending = false;
    view.rerender(tree());
    expect(screen.getByText("Run Review").closest("button")).toHaveFocus();
  });

  it("Escape returns focus to the trigger once the start is no longer pending (PR3-C3)", () => {
    const tree = () => (
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <RunReviewDropdown prId="pr1" />
      </NextIntlClientProvider>
    );
    const view = render(tree());
    fireEvent.click(screen.getByText("Run Review"));
    startPending = true;
    view.rerender(tree());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("Pick agents to run")).toBeNull();
    startPending = false;
    view.rerender(tree());
    expect(screen.getByText("Run Review").closest("button")).toHaveFocus();
  });
});
