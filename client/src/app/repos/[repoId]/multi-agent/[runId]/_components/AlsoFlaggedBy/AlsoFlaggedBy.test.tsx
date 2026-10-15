/* AlsoFlaggedBy — AC-44: names the other agents; a deleted agent reads "Deleted agent". */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentColumn } from "@devdigest/shared";
import runs from "../../../../../../../../messages/en/runs.json";
import { AlsoFlaggedBy } from "./AlsoFlaggedBy";

afterEach(cleanup);

const col = (run_id: string, agent_name: string | null) => ({ run_id, agent_name }) as AgentColumn;

function renderIt(runIds: string[]) {
  render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <AlsoFlaggedBy runIds={runIds} columns={[col("r1", "Security"), col("r2", null)]} />
    </NextIntlClientProvider>,
  );
}

describe("AlsoFlaggedBy", () => {
  it("names each other agent, and the deleted one by its label", () => {
    renderIt(["r1", "r2"]);
    expect(screen.getByText("also flagged by Security, Deleted agent")).toBeTruthy();
  });

  it("renders nothing when no other agent flagged the location", () => {
    renderIt([]);
    expect(screen.queryByText(/also flagged by/)).toBeNull();
  });
});
