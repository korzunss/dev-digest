/**
 * PRRow — the FINDINGS column's click contract (spec 002). The row itself is a
 * navigation target, so the one regression that matters is a chip click landing
 * on the UNFILTERED PR because the row handler fired too.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

// The hover card's data comes from this hook; the mock records what id it was
// asked for, which is how "nothing is fetched until hover" is asserted.
const reviewsFor = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: (prId: string | null) => {
    reviewsFor(prId);
    return {
      data: prId
        ? [
            {
              id: "rv1",
              findings: [
                {
                  id: "f1",
                  severity: "CRITICAL",
                  category: "security",
                  title: "Hardcoded Stripe secret key in commit",
                  file: "src/config.ts",
                  start_line: 12,
                  end_line: 12,
                  rationale: "A literal sk_live_ key is committed.",
                  suggestion: null,
                  confidence: 0.98,
                  kind: "finding",
                  trifecta_components: null,
                  evidence: null,
                  review_id: "rv1",
                  accepted_at: null,
                  dismissed_at: null,
                },
              ],
            },
          ]
        : undefined,
      isLoading: false,
    };
  },
}));

import { PRRow } from "./PRRow";

afterEach(() => {
  cleanup();
  push.mockClear();
  reviewsFor.mockClear();
});

function pr(overrides: Partial<PrMeta> = {}): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rate-limit-public",
    base: "main",
    head_sha: "a1b2c3d4",
    additions: 247,
    deletions: 38,
    files_count: 9,
    status: "needs_review",
    opened_at: null,
    updated_at: null,
    score: 61,
    cost_usd: 0.014,
    cost_source: "api",
    findings: { critical: 2, warning: 2, suggestion: 2 },
    ...overrides,
  };
}

function renderRow(meta: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={meta} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — FINDINGS column", () => {
  it("navigates to the PR filtered to the level that was clicked", () => {
    renderRow(pr());
    fireEvent.click(screen.getByLabelText(/2 warning/));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/repos/repo-1/pulls/482?tab=findings&severity=WARNING");
  });

  it("still navigates unfiltered when the row itself is clicked", () => {
    renderRow(pr());
    fireEvent.click(screen.getByText("Add rate limiting to public API endpoints"));
    expect(push).toHaveBeenCalledWith("/repos/repo-1/pulls/482");
  });

  it("shows an em dash for a PR that was never reviewed", () => {
    renderRow(pr({ score: null, findings: null }));
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("PRRow — findings hover preview (spec 002)", () => {
  it("fetches nothing until the counter is hovered", () => {
    renderRow(pr());
    // The hook still runs — it is gated on a null id, which is what keeps the
    // list from firing one request per row on mount.
    expect(reviewsFor).toHaveBeenCalledWith(null);
    expect(reviewsFor).not.toHaveBeenCalledWith("pr-1");
  });

  it("asks for that PR's findings on hover and previews them", () => {
    renderRow(pr());
    fireEvent.mouseEnter(screen.getByLabelText(/2 critical/).parentElement!.parentElement!);
    expect(reviewsFor).toHaveBeenCalledWith("pr-1");
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
  });
});
