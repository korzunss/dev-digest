import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("@/lib/hooks/multi-agent", () => ({
  useAgentEstimates: () => ({ data: [] }),
}));

import { AgentPickerPanel } from "./AgentPickerPanel";
import { initialSelection, toggleId, estimateParts } from "./helpers";

afterEach(cleanup);

const AGENTS = [
  { id: "a1", name: "Security", enabled: true },
  { id: "a2", name: "Style", enabled: false },
] as unknown as Agent[];

function panel() {
  return (
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <AgentPickerPanel
        agents={AGENTS}
        selected={["a1"]}
        onSelectedChange={vi.fn()}
        position={{ top: 0, left: 0 }}
        warnMerged={false}
        hasEnabled
        onRunAll={vi.fn()}
        onRunOne={vi.fn()}
        onRunMulti={vi.fn()}
        onConfigure={vi.fn()}
      />
    </NextIntlClientProvider>
  );
}

describe("AgentPickerPanel", () => {
  it("moves focus into the dialog on open and back to the trigger on close (PR-C3)", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(panel());
    expect(screen.getByRole("dialog")).toHaveFocus();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("renders the merged warning and reports toggles in agent order", () => {
    const onSelectedChange = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <AgentPickerPanel
          agents={AGENTS}
          selected={["a1"]}
          onSelectedChange={onSelectedChange}
          position={{ top: 0, left: 0 }}
          warnMerged
          hasEnabled
          onRunAll={vi.fn()}
          onRunOne={vi.fn()}
          onRunMulti={vi.fn()}
          onConfigure={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Already merged — review is informational")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    expect(onSelectedChange).toHaveBeenCalledWith(["a1", "a2"]);
  });

  it("helpers: seed enabled agents, toggle, and treat sample_size 0 as no estimate", () => {
    expect(initialSelection(AGENTS)).toEqual(["a1"]);
    expect(toggleId(AGENTS, ["a2"], "a1")).toEqual(["a1", "a2"]);
    expect(estimateParts(undefined)).toBeNull();
    expect(
      estimateParts({ agent_id: "a1", duration_ms: null, cost_usd: null, sample_size: 0, last_verdict: null }),
    ).toBeNull();
    expect(
      estimateParts({ agent_id: "a1", duration_ms: 1500, cost_usd: null, sample_size: 2, last_verdict: null }),
    ).toEqual({ duration: "2", cost: "—" });
  });
});
