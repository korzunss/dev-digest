/**
 * RunCostBadge — the two shapes cost takes on screen. The formatter has its own
 * unit tests; what matters here is that the `cell` variant stays bare and the
 * `inline` one carries tokens, and that neither invents a price it doesn't have.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

function renderBadge(props: React.ComponentProps<typeof RunCostBadge>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunCostBadge {...props} />
    </NextIntlClientProvider>,
  );
}

describe("RunCostBadge — cell variant (PR list column)", () => {
  it("shows the cost alone", () => {
    renderBadge({ costUsd: 0.014, costSource: "api" });
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows an em dash for a PR nothing has priced", () => {
    renderBadge({ costUsd: null });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("explains an estimate on hover", () => {
    renderBadge({ costUsd: 0.014, costSource: "estimate" });
    const el = screen.getByText("~$0.014");
    expect(el).toHaveAttribute("title", expect.stringContaining("Estimated"));
  });
});

describe("RunCostBadge — inline variant (timeline)", () => {
  it("reads '<tokens> tok · <cost>'", () => {
    renderBadge({ variant: "inline", costUsd: 0.0013, costSource: "api", tokensIn: 8_900, tokensOut: 219 });
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("drops the token half when there are no counts", () => {
    renderBadge({ variant: "inline", costUsd: 0.0013, costSource: "api" });
    expect(screen.getByText("$0.0013")).toBeInTheDocument();
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
  });
});
