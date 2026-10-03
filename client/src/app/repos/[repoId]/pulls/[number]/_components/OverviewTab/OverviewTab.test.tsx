/**
 * OverviewTab — what the user reads, in order: Intent, then Blast radius with
 * Prior PRs, then the description; no PR Brief label and no Risk areas. Hook submodules are mocked with `importActual` spread so
 * the cards' other imports survive (client gotchas → Tests).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import brief from "../../../../../../../../messages/en/brief.json";
import blast from "../../../../../../../../messages/en/blast.json";

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
    <NextIntlClientProvider locale="en" messages={{ brief, blast }}>
      <OverviewTab prId="pr1" prHeadSha="abc" prBody={prBody} repo={null} />
    </NextIntlClientProvider>,
  );
}

describe("OverviewTab — two columns", () => {
  it("shows Intent first, then Blast radius with Prior PRs, then the description, with no PR Brief / Risk areas", () => {
    renderTab();

    const intent = screen.getByText("Intent");
    const blastTitle = screen.getByText(blast.title);
    const prior = screen.getByText(blast.history.title);
    const description = screen.getByText("A description");
    const follows = (a: Element, b: Element) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(intent, blastTitle)).toBe(true);
    expect(follows(blastTitle, prior)).toBe(true);
    expect(follows(prior, description)).toBe(true);

    expect(screen.queryByText("PR Brief")).not.toBeInTheDocument();
    expect(screen.queryByText(/Risk areas/i)).not.toBeInTheDocument();
  });
});
