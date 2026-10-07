/**
 * OverviewTab — what the user reads, in order: the PR Brief heading, then (inside
 * its section) Intent, Blast radius with Prior PRs, then the description. Hook
 * submodules are mocked with `importActual` spread so the cards' other imports
 * survive (client gotchas → Tests).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import brief from "../../../../../../../../messages/en/brief.json";
import blast from "../../../../../../../../messages/en/blast.json";
import prReview from "../../../../../../../../messages/en/prReview.json";

vi.mock("@/lib/hooks/brief", async (orig) => ({
  ...(await orig<typeof import("@/lib/hooks/brief")>()),
  usePrBrief: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useGeneratePrBrief: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock("@/lib/hooks/reviews", async (orig) => ({
  ...(await orig<typeof import("@/lib/hooks/reviews")>()),
  usePrReviews: () => ({ data: [] }),
  usePrRuns: () => ({ data: [] }),
}));
vi.mock("@/lib/hooks/intent", async (orig) => ({
  ...(await orig<typeof import("@/lib/hooks/intent")>()),
  usePrIntent: () => ({ data: { intent: null, pr_head_sha: "a" }, isLoading: false, isError: false }),
  useClassifyIntent: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock("@/lib/hooks/blast", async (orig) => ({
  ...(await orig<typeof import("@/lib/hooks/blast")>()),
  useBlastRadius: () => ({ data: undefined, isLoading: true, isError: false }),
  usePrHistory: () => ({ data: { status: "ok", history: [] }, isLoading: false, isError: false }),
}));
vi.mock("@/lib/hooks/repo-intel", async (orig) => ({
  ...(await orig<typeof import("@/lib/hooks/repo-intel")>()),
  useResyncRepoIntel: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useRepoIntelStatus: () => ({ data: undefined }),
}));

import { OverviewTab } from "./OverviewTab";

afterEach(cleanup);

function renderTab(prBody: string | null = "A description") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief, blast, prReview }}>
      <OverviewTab prId="pr1" prHeadSha="abc" prBody={prBody} repo={null} diffPaths={[]} onOpenInDiff={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe("OverviewTab — PR Brief section", () => {
  it("puts the PR Brief heading first, both cards inside its section, then the description", () => {
    renderTab();

    const heading = screen.getByText("PR Brief");
    const section = heading.closest("section") as HTMLElement;
    const intent = within(section).getByText("Intent");
    const blastTitle = within(section).getByText(blast.title);
    const prior = within(section).getByText(blast.history.title);
    const description = screen.getByText("A description");
    const follows = (a: Element, b: Element) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(heading, intent)).toBe(true);
    expect(follows(intent, blastTitle)).toBe(true);
    expect(follows(blastTitle, prior)).toBe(true);
    expect(section.contains(description)).toBe(false);
    expect(follows(prior, description)).toBe(true);
  });
});
