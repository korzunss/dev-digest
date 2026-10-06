import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import { VerdictBanner } from "./VerdictBanner";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("VerdictBanner (smoke)", () => {
  it("shows verdict label + score + finding/blocker counts", () => {
    renderWithIntl(
      <VerdictBanner
        verdict="request_changes"
        summary="Hardcoded secret introduced."
        score={42}
        findingsCount={1}
        blockers={1}
        agentName="Security Reviewer"
      />,
    );
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    // AC-32: the summary is the banner's text, in the same banner as the verdict
    expect(screen.getByText("Hardcoded secret introduced.").parentElement).toHaveTextContent("Request changes");
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/1 findings · 1 blockers/)).toBeInTheDocument();
  });

  it("renders the scoreFooter slot under the score, even without a score", () => {
    const a = renderWithIntl(
      <VerdictBanner verdict="approve" summary={null} score={80} findingsCount={0} blockers={0} scoreFooter={<span>cost slot</span>} />,
    );
    expect(screen.getByText("cost slot")).toBeInTheDocument();
    const label = screen.getByText("PR SCORE", { exact: false });
    const slot = screen.getByText("cost slot");
    expect(label).toBeInTheDocument();
    // same score column, footer after the label
    const col = label.parentElement as HTMLElement;
    expect(col).toContainElement(slot);
    expect(label.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    a.unmount();

    renderWithIntl(
      <VerdictBanner verdict="approve" summary={null} score={null} findingsCount={0} blockers={0} scoreFooter={<span>cost slot</span>} />,
    );
    expect(screen.getByText("cost slot")).toBeInTheDocument();
  });
});
