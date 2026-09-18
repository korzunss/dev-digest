import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

const FINDINGS: FindingRecord[] = [finding({ id: "f1" })];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel — focus moving between cards", () => {
  it("does not mix shorthand and non-shorthand border styles", () => {
    // React warns when a style SHORTHAND changes on a mounted node that also
    // carries a conflicting longhand. FindingCard's accent border is per-side
    // longhand for exactly this reason; `borderColor` + `borderLeftColor` is
    // still a shorthand pair and reintroduces the warning as soon as focus
    // moves — which j/k does, and which the severity filter does by reordering.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderWithIntl(
      <FindingsPanel
        findings={[finding({ id: "f1" }), finding({ id: "f2", severity: "WARNING" })]}
        prId="pr1"
      />,
    );
    fireEvent.keyDown(window, { key: "j" });
    const messages = spy.mock.calls.map((c) => String(c[0])).join("\n");
    spy.mockRestore();
    expect(messages).not.toMatch(/shorthand/i);
  });
});

describe("FindingsPanel — severity filter (spec 002)", () => {
  const MIXED = [
    finding({ id: "f1", severity: "CRITICAL", title: "Hardcoded secret" }),
    finding({ id: "f2", severity: "WARNING", title: "N+1 query", confidence: 0.86 }),
    finding({ id: "f3", severity: "WARNING", title: "Unbounded retry", confidence: 0.3 }),
    finding({ id: "f4", severity: "SUGGESTION", title: "Extract magic number" }),
  ];

  it("keeps only the requested level", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" severity="WARNING" />);
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.getByText("Unbounded retry")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.queryByText("Extract magic number")).not.toBeInTheDocument();
  });

  it("shows everything again once the filter is cleared", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" severity={null} />);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("Extract magic number")).toBeInTheDocument();
  });

  it("ANDs with hide-low-confidence: a low-confidence WARNING stays hidden", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" severity="WARNING" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.queryByText("Unbounded retry")).not.toBeInTheDocument();
  });

  it("falls back to the empty state when the level has no findings", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" severity="SUGGESTION" />);
    expect(screen.getByText("Extract magic number")).toBeInTheDocument();
    renderWithIntl(
      <FindingsPanel findings={[finding({ id: "f9", severity: "CRITICAL" })]} prId="pr1" severity="WARNING" />,
    );
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});
