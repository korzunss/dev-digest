/* LatestRunLink — AC-15g. */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { MultiAgentRunSummary } from "@devdigest/shared";
import runs from "../../../../../../../messages/en/runs.json";
import { LatestRunLink } from "./LatestRunLink";

afterEach(cleanup);

const RUN: MultiAgentRunSummary = {
  id: "m1",
  pr_id: "pr-1",
  pr_number: 7,
  pr_title: "Fix auth",
  ran_at: "2026-06-11T18:44:34.000Z",
  status: "running",
  agent_count: 2,
  agent_names: ["Security", "Style"],
  total_duration_ms: null,
  total_cost_usd: null,
  total_cost_partial: false,
};

const renderIt = (run: MultiAgentRunSummary | null | undefined) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <LatestRunLink repoId="r1" run={run} />
    </NextIntlClientProvider>,
  );

describe("LatestRunLink", () => {
  it("links to the PR's latest run with its status, and renders nothing without a run", () => {
    const { unmount } = renderIt(RUN);
    const link = screen.getByRole("link", { name: /Latest run for #7/ });
    expect(link).toHaveAttribute("href", "/repos/r1/multi-agent/m1");
    expect(link.textContent).toContain("running");
    unmount();
    const { container } = renderIt(null);
    expect(container).toBeEmptyDOMElement();
  });
});
