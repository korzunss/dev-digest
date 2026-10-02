/**
 * OverviewTab — structure only: a two-column grid (Intent left, Blast radius
 * right) as the tab's first child, headers inside the cards, no PR Brief label
 * and no Risk areas. Hook submodules are mocked with `importActual` spread so
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
  it("puts Intent left and Blast radius + Prior PRs right, first in the tab, no PR Brief / Risk areas", () => {
    const { container } = renderTab();

    const columns = screen.getByTestId("overview-columns");
    expect(container.firstElementChild).toBe(columns);
    expect(columns.children).toHaveLength(2);
    expect(columns.children[0]).toHaveTextContent("Intent");
    expect(columns.children[1]).toHaveTextContent("Blast radius");
    expect(columns.children[1]).toHaveTextContent("Prior PRs touching these files");

    expect(screen.queryByText("PR Brief")).not.toBeInTheDocument();
    expect(screen.queryByText(/Risk areas/i)).not.toBeInTheDocument();
    expect(screen.getByText("A description")).toBeInTheDocument();
  });
});
