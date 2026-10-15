import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentEstimate } from "@devdigest/shared";
import runs from "../../../../../../../messages/en/runs.json";
import { AgentPickList } from "./AgentPickList";

afterEach(cleanup);

const AGENTS = [
  { id: "a1", name: "Security", enabled: true },
  { id: "a2", name: "Style", enabled: true },
] as unknown as Agent[];
const ESTIMATES: AgentEstimate[] = [
  { agent_id: "a1", duration_ms: 42_000, cost_usd: 0.03, sample_size: 3, last_verdict: "Found two injection risks." },
];

function renderList() {
  const props = { agents: AGENTS, selected: ["a1"], estimates: ESTIMATES, onToggle: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <AgentPickList {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("AgentPickList", () => {
  it("shows name, last verdict as text and the estimate; reports toggles (AC-12, AC-13)", () => {
    const props = renderList();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Found two injection risks.")).toBeInTheDocument();
    expect(screen.getByText(/^42s · \$/)).toBeInTheDocument();
    expect(screen.getByText("no estimate yet")).toBeInTheDocument();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[0]).toHaveAttribute("aria-checked", "true");
    expect(boxes[1]).toHaveAttribute("aria-checked", "false");
    fireEvent.click(boxes[1]!);
    expect(props.onToggle).toHaveBeenCalledWith("a2");
    fireEvent.click(screen.getByText("Security"));
    expect(props.onToggle).toHaveBeenCalledWith("a1");
    expect(screen.getAllByTestId("agent-identity")[0]).toHaveAttribute("data-icon", "Shield");
  });
});
