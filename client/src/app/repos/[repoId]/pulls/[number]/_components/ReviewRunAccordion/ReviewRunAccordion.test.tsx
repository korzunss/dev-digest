/**
 * Deleting a review run asks through ConfirmModal, not `window.confirm`.
 *
 * The old call blocked the thread, so a delete already in flight could not say
 * so, and its copy was a hardcoded English template string that never reached
 * next-intl. Both are asserted here: the copy comes from `messages/en`, and the
 * confirm button reports pending state.
 *
 * `fireEvent`, not `userEvent` — `@testing-library/user-event` is not a
 * dependency of this package (client/INSIGHTS.md).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReviewRecord } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../../messages/en/common.json";
import { ReviewRunAccordion } from "./ReviewRunAccordion";

const mutate = vi.fn();
let pending = false;

// Override ONLY the delete hook: the open accordion renders FindingsPanel,
// which reaches for other hooks from this same module.
vi.mock("../../../../../../../lib/hooks/reviews", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  useDeleteReview: () => ({ mutate, isPending: pending }),
}));

afterEach(() => {
  cleanup();
  mutate.mockReset();
  pending = false;
});

const REVIEW = {
  id: "rv1",
  pr_id: "pr1",
  agent_name: "Security Reviewer",
  verdict: "comment",
  score: 72,
  created_at: "2026-06-01T00:00:00Z",
  // Rendered by VerdictBanner, which exists only inside the OPEN body — so it
  // is a reliable marker for "did the accordion expand".
  summary: "Nothing blocking in this pass.",
  findings: [],
} as unknown as ReviewRecord;

function renderAccordion(review: ReviewRecord = REVIEW) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview, common }}>
        <ReviewRunAccordion review={review} prId="pr1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function openConfirm() {
  fireEvent.click(screen.getByLabelText(prReview.deleteReview.label));
}

describe("ReviewRunAccordion — delete confirmation", () => {
  it("asks before deleting instead of firing straight away", () => {
    renderAccordion();
    openConfirm();
    expect(screen.getByText(prReview.deleteReview.title)).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("names the agent in the body, through next-intl", () => {
    renderAccordion();
    openConfirm();
    // The old string was built with a template literal in the component and
    // never passed through the i18n layer at all.
    expect(
      screen.getByText(/Delete the Security Reviewer review run\?/),
    ).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when the run has no agent name", () => {
    renderAccordion({ ...REVIEW, agent_name: null } as unknown as ReviewRecord);
    openConfirm();
    expect(screen.getByText(/Delete the agent review run\?/)).toBeInTheDocument();
  });

  it("deletes only once confirmed, and closes without deleting on cancel", () => {
    renderAccordion();
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: common.actions.cancel }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.queryByText(prReview.deleteReview.title)).not.toBeInTheDocument();

    openConfirm();
    fireEvent.click(
      screen.getByRole("button", { name: prReview.deleteReview.action }),
    );
    expect(mutate).toHaveBeenCalledWith("rv1", expect.anything());
  });

  it("opening the confirmation does not toggle the accordion underneath", () => {
    // The trash button sits inside the header row, which is itself a click
    // target that expands the run — so the handler has to stop propagation.
    renderAccordion();
    expect(screen.queryByText(REVIEW.summary!)).not.toBeInTheDocument();
    openConfirm();
    expect(screen.getByText(prReview.deleteReview.title)).toBeInTheDocument();
    expect(screen.queryByText(REVIEW.summary!)).not.toBeInTheDocument();
  });

  it("locks the confirm button while the delete is in flight", () => {
    // window.confirm blocked the thread, so this state could not be shown at
    // all. Pending is flipped AFTER opening on purpose: the trash button is
    // itself disabled during a delete, so a run starting in that state could
    // never reach the dialog.
    const { rerender } = renderAccordion();
    openConfirm();
    pending = true;
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <NextIntlClientProvider locale="en" messages={{ prReview, common }}>
          <ReviewRunAccordion review={REVIEW} prId="pr1" />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole("button", { name: prReview.deleteReview.action }),
    ).toBeDisabled();
  });
});
