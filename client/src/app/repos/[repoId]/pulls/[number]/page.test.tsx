/* PR detail page — the wiring the component tests cannot see: the trace drawer
   is keyed by the run it shows (PR3-C1), so opening another run remounts it and
   its per-run state (the "first seen ended" clock, the picked tab) cannot leak
   across runs. Children and data hooks are stubbed; the drawer is a stub that
   remembers the run it was MOUNTED with. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../messages/en/prReview.json";

let search = new URLSearchParams("trace=r1");
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo1", number: "7" }),
  useSearchParams: () => search,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => null }));
vi.mock("@/components/confirm-modal", () => ({ ConfirmModal: () => null }));
vi.mock("./_components/PrDetailHeader", () => ({ PrDetailHeader: () => null }));
vi.mock("./_components/OverviewTab", () => ({ OverviewTab: () => null }));
vi.mock("./_components/FindingsTab", () => ({ FindingsTab: () => null }));
vi.mock("./_components/DiffTab", () => ({ DiffTab: () => null }));
vi.mock("@/lib/hooks", () => ({
  usePulls: () => ({ data: [{ id: "pr-uuid", number: 7 }], isLoading: false }),
  usePullDetail: () => ({
    data: { number: 7, head_sha: "abc", body: "", files: [], files_count: 0, commits: [], status: "open" },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [], refetch: vi.fn() }),
  useCancelRun: () => ({}),
  usePrActiveRuns: () => ({ data: [] }),
  usePrRuns: () => ({ data: [] }),
  useDeleteRun: () => ({ isPending: false, mutate: vi.fn() }),
  useRefreshOnRunsSettled: () => undefined,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "repo1", full_name: "acme/api", provider: "github", api_base: null } }),
  useRepoNotFound: () => false,
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));

const mounts: string[] = [];
vi.mock("@/components/run-trace-drawer", () => ({
  default: ({ runId }: { runId: string }) => {
    const [mountedWith] = React.useState(runId);
    React.useEffect(() => {
      mounts.push(runId);
    }, [runId]);
    return <div data-testid="drawer">{mountedWith}</div>;
  },
}));

import PRDetailPage from "./page";

const page = () => (
  <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
    <PRDetailPage />
  </NextIntlClientProvider>
);

beforeEach(() => {
  mounts.length = 0;
  search = new URLSearchParams("trace=r1");
});
afterEach(cleanup);

describe("PR detail page trace drawer", () => {
  it("remounts the drawer when another run's trace is opened, so no state carries over (PR3-C1)", () => {
    const view = render(page());
    expect(screen.getByTestId("drawer")).toHaveTextContent("r1");

    search = new URLSearchParams("trace=r2");
    view.rerender(page());

    // a drawer that merely re-rendered would still hold the state it mounted with ("r1")
    expect(screen.getByTestId("drawer")).toHaveTextContent("r2");
    expect(mounts).toEqual(["r1", "r2"]);
  });

  it("renders no drawer without a trace param", () => {
    search = new URLSearchParams("");
    render(page());
    expect(screen.queryByTestId("drawer")).toBeNull();
  });
});
