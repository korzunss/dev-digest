/**
 * The external-link button used to be a hardcoded View on GitHub. It now reads
 * its label from next-intl with the forge interpolated, which is two things
 * that can break quietly: a missing message key (next-intl renders the key path
 * instead of copy) and a GitLab repo still being told it is GitHub.
 *
 * `fireEvent`, not `userEvent` — that package is not a dependency (client/INSIGHTS.md).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrDetail } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import common from "../../../../../../../../messages/en/common.json";

// The header renders RunReviewDropdown, which needs the app router and two
// hooks. Only those are replaced — spreading the real module first, because a
// bare factory would strip the rest of the barrel and break a child that
// imports a sibling hook (client/INSIGHTS.md).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../../../../../../../lib/hooks/agents", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  useAgents: () => ({ data: [] }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  useRunReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { PrDetailHeader } from "./PrDetailHeader";

afterEach(cleanup);

const PR = {
  number: 7,
  title: "Add rate limiting",
  author: "korzunss",
  branch: "feat/rl",
  base: "main",
  head_sha: "abc123",
  additions: 10,
  deletions: 2,
  files_count: 1,
  status: "open",
  files: [],
  commits: [],
} as unknown as PrDetail;

function renderHeader(props: Partial<React.ComponentProps<typeof PrDetailHeader>> = {}) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview, common }}>
        <PrDetailHeader
          pr={PR}
          prId="pr1"
          tab="overview"
          findingsCount={0}
          onSetTab={vi.fn()}
          onRunStart={vi.fn()}
          onRunsStarted={vi.fn()}
          {...props}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("PrDetailHeader — the forge link", () => {
  it("names GitLab when the repo is on GitLab", () => {
    renderHeader({
      forgeUrl: "https://gitlab.sharksw.com/team/api/-/merge_requests/7",
      forgeLabel: "GitLab",
    });
    expect(screen.getByRole("button", { name: "View on GitLab" })).toBeEnabled();
  });

  it("still says GitHub for a GitHub repo", () => {
    renderHeader({ forgeUrl: "https://github.com/acme/api/pull/7", forgeLabel: "GitHub" });
    expect(screen.getByRole("button", { name: "View on GitHub" })).toBeEnabled();
  });

  it("resolves the message key rather than rendering it", () => {
    // A missing prReview.viewOnForge would surface as the literal key path.
    renderHeader({ forgeUrl: "https://example.com", forgeLabel: "GitLab" });
    expect(screen.queryByText(/viewOnForge/)).not.toBeInTheDocument();
  });

  it("falls back to GitHub while the repo is still loading", () => {
    // forgeLabel is null until the active repo resolves; the button must not
    // render an empty name in that window.
    renderHeader({ forgeUrl: null, forgeLabel: null });
    const btn = screen.getByRole("button", { name: "View on GitHub" });
    expect(btn).toBeDisabled();
  });

  it("opens the forge URL in a new tab", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const url = "https://gitlab.sharksw.com/team/api/-/merge_requests/7";
    renderHeader({ forgeUrl: url, forgeLabel: "GitLab" });
    fireEvent.click(screen.getByRole("button", { name: "View on GitLab" }));
    expect(open).toHaveBeenCalledWith(url, "_blank", "noopener,noreferrer");
    open.mockRestore();
  });
});
