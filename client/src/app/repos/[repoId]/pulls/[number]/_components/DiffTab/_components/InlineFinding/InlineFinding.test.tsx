/**
 * InlineFinding — a route-owned card matching the "webhooks.ts" mockup (spec
 * 007, D19-B), not the Agent runs FindingCard: severity word + icon, title,
 * category, `line X-Y`, no file path, no chevron, a single × that collapses
 * to a one-line stub (D9-B) and restores on click.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import prReview from "../../../../../../../../../../messages/en/prReview.json";
import { InlineFinding } from "./InlineFinding";

afterEach(cleanup);

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key in commit",
    file: "src/config.ts",
    start_line: 61,
    end_line: 74,
    rationale: "Line 61 contains a literal string starting with sk_live_.",
    suggestion: "Move the key to an environment variable.",
    confidence: 0.79,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function renderInline(props: Partial<React.ComponentProps<typeof InlineFinding>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview }}>
      <InlineFinding f={finding()} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("InlineFinding", () => {
  it("renders the own-card design, dismisses through the mutation, and collapses/restores via the ×", () => {
    const onAction = vi.fn();
    renderInline({ onAction });

    // Own design: severity word (styled uppercase via CSS textTransform, the
    // translation itself is lowercase "blocker"), title, category, "line
    // X-Y", no file path.
    expect(screen.getByText("blocker")).toHaveStyle({ textTransform: "uppercase" });
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("line 61-74")).toBeInTheDocument();
    expect(screen.queryByText("src/config.ts")).not.toBeInTheDocument();
    expect(screen.queryByText(/src\/config\.ts:/)).not.toBeInTheDocument();
    expect(screen.getByText("Suggested fix")).toBeInTheDocument();
    // No chevron toggle: only the ×, Accept and Dismiss buttons exist.
    expect(screen.getAllByRole("button")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: prReview.finding.dismiss }));
    expect(onAction).toHaveBeenCalledWith("dismiss");

    // × collapses to a one-line stub carrying the severity word and the
    // title, not hiding the card.
    fireEvent.click(screen.getByRole("button", { name: prReview.smartDiff.closeFinding }));
    expect(screen.queryByText("Suggested fix")).not.toBeInTheDocument();
    const stub = screen.getByRole("button", { name: /Hardcoded Stripe secret key in commit/ });
    expect(stub).toHaveAttribute("aria-expanded", "false");
    expect(within(stub).getByText("blocker")).toHaveStyle({ textTransform: "uppercase" });

    // Clicking the stub restores the full card.
    fireEvent.click(stub);
    expect(screen.getByText("Suggested fix")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
  });

  it("shows a single-line range without a dash", () => {
    renderInline({ f: finding({ start_line: 12, end_line: 12 }) });
    expect(screen.getByText("line 12")).toBeInTheDocument();
  });
});
