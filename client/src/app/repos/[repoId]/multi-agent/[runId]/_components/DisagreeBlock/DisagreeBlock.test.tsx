/* DisagreeBlock — AC-35, 46, 47, 50, 51. */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Conflict } from "@devdigest/shared";
import runs from "../../../../../../../../messages/en/runs.json";
import { DisagreeBlock } from "./DisagreeBlock";

afterEach(cleanup);

const take = (run_id: string, name: string | null, verdict: string, title: string | null) => ({
  run_id,
  agent_id: name ? `a-${run_id}` : null,
  agent_name: name,
  verdict,
  finding_id: title ? `f-${run_id}` : null,
  title,
});
const CONFLICTS = [
  {
    id: "g1",
    file: "src/ratelimit.ts",
    line: 28,
    title: "Magic number 3600",
    severity: "SUGGESTION",
    is_conflict: true,
    takes: [
      take("r1", "Junior Mentor", "SUGGESTION", "Extract for readability"),
      take("r2", "Security", "ignored", null),
    ],
  },
  {
    id: "g2",
    file: "src/ratelimit.ts",
    line: 52,
    title: "429 response shape",
    severity: "WARNING",
    is_conflict: false,
    takes: [take("r1", "Junior Mentor", "WARNING", "Shape"), take("r3", null, "WARNING", "Shape")],
  },
] as unknown as Conflict[];

function renderIt(conflicts: Conflict[]) {
  render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <DisagreeBlock conflicts={conflicts} />
    </NextIntlClientProvider>,
  );
}

describe("DisagreeBlock", () => {
  it("lists each group with file:line, title and a take per agent; the toggle keeps only conflicts", () => {
    renderIt(CONFLICTS);
    expect(screen.getAllByTestId("conflict-group")).toHaveLength(2);
    const first = within(screen.getAllByTestId("conflict-group")[0]!);
    expect(first.getByText("src/ratelimit.ts:28")).toBeTruthy();
    expect(first.getByText("Magic number 3600")).toBeTruthy();
    expect(first.getByText("Suggestion")).toBeTruthy();
    expect(first.getByText("Extract for readability")).toBeTruthy();
    expect(first.getByText("did not flag")).toBeTruthy();
    expect(screen.getByText("Deleted agent")).toBeTruthy();

    const toggle = screen.getByRole("switch", { name: "Show only conflicts" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getAllByTestId("conflict-group")).toHaveLength(1);
    expect(screen.getByText("Magic number 3600")).toBeTruthy();
    expect(screen.queryByText("429 response shape")).toBeNull();
  });

  it("shows the agreement copy when there is nothing to list", () => {
    renderIt([]);
    expect(
      screen.getByText("No conflicts — the agents agree on every flagged location."),
    ).toBeTruthy();
    expect(screen.queryByTestId("conflict-group")).toBeNull();
  });
});
