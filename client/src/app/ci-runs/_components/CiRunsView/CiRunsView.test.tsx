/* CiRunsView — what a user sees on the CI Runs page: rows newest first, the PR
   link only for locally tracked PRs, a deleted agent marked, "Load more" paging,
   filters in the URL, the empty state and the refresh banner (AC-51, 52, 66). */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CiRefreshResult, CiRunView, CiRunsPage } from "@devdigest/shared";
import { NAV } from "@devdigest/ui";
import ciMessages from "../../../../../messages/en/ci.json";
import { parseFilters, sinceFor } from "./helpers";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p), post: (p: string, b?: unknown) => post(p, b) },
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const replace = vi.fn();
let params = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/ci-runs",
  useSearchParams: () => new URLSearchParams(params),
}));

import { CiRunsView } from "./CiRunsView";

const run = (id: string, over: Partial<CiRunView> = {}): CiRunView => ({
  id,
  repo: "acme/payments-api",
  pr_number: 7,
  local_pr: null,
  agent_id: "a1",
  agent_name: "Security Reviewer",
  agent_deleted: false,
  verdict: null,
  status: "passed",
  findings_count: 3,
  cost_usd: 0.12,
  duration_ms: 4000,
  ran_at: "2026-10-01T10:00:00.000Z",
  job_url: "https://github.com/acme/payments-api/actions/runs/1",
  ...over,
});

const REFRESH: CiRefreshResult = { recorded: 0, rejected: [], errors: [] };

function serve(pages: Record<string, CiRunsPage>, refresh: CiRefreshResult = REFRESH) {
  get.mockImplementation(async (path: string) => {
    if (path === "/agents") return [{ id: "a1", name: "Security Reviewer" }];
    if (path === "/repos") return [{ id: "r1", full_name: "acme/payments-api" }];
    if (path.startsWith("/ci/runs")) {
      const cursor = new URL(path, "http://x").searchParams.get("cursor") ?? "";
      return pages[cursor] ?? { items: [], next_cursor: null };
    }
    throw new Error(`unexpected GET ${path}`);
  });
  post.mockResolvedValue(refresh);
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
        <CiRunsView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  params = "";
  get.mockReset();
  post.mockReset();
  replace.mockReset();
});
afterEach(cleanup);

describe("CiRunsView", () => {
  it("lists runs, links a locally tracked PR, marks a deleted agent and pages on demand", async () => {
    serve({
      "": {
        items: [
          run("1", { local_pr: { repo_id: "r1", number: 7 } }),
          run("2", { pr_number: 9, agent_deleted: true, agent_name: "Old Agent", status: "gate_failed" }),
        ],
        next_cursor: "c2",
      },
      c2: { items: [run("3", { pr_number: 11, status: "error", findings_count: null })], next_cursor: null },
    });
    renderView();

    const link = await screen.findByRole("link", { name: "#7" });
    expect(link.getAttribute("href")).toBe("/repos/r1/pulls/7");
    expect(screen.queryByRole("link", { name: "#9" })).toBeNull();
    expect(screen.getByText("#9")).toBeTruthy();
    expect(screen.getByText("Old Agent (deleted)")).toBeTruthy();
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Gate failed")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("#11")).toBeTruthy();
    expect(within(screen.getByRole("table")).getByText("Error")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(post).toHaveBeenCalledWith("/ci/refresh", { agent_id: null });
  });

  it("AC-52: each row shows the verdict and the duration as visible cells", async () => {
    serve({ "": { items: [run("1", { verdict: "request_changes", duration_ms: 65_000 }), run("2", { verdict: null, duration_ms: null })], next_cursor: null } });
    renderView();
    await screen.findAllByText("#7");
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Verdict")).toBeTruthy();
    expect(table.getByText("Duration")).toBeTruthy();
    expect(table.getByText("Request changes")).toBeTruthy();
    expect(table.getByText("1m 5s")).toBeTruthy();
  });

  it("AC-53: All time sends an explicit epoch `since`, not the server's 7-day default", async () => {
    params = "range=all";
    serve({ "": { items: [run("1")], next_cursor: null } });
    renderView();
    await screen.findByText("#7");
    const path = get.mock.calls.map((c) => c[0] as string).find((p) => p.startsWith("/ci/runs"))!;
    expect(new URL(path, "http://x").searchParams.get("since")).toBe("1970-01-01T00:00:00.000Z");
  });

  it("shows the empty state, and keeps rows next to a refresh banner", async () => {
    serve({});
    renderView();
    expect(await screen.findByText("No CI runs yet")).toBeTruthy();
    cleanup();

    serve({ "": { items: [run("1")], next_cursor: null } }, {
      recorded: 0,
      rejected: [{ repo: "acme/payments-api", run_id: "99", reason: "bad artifact" }],
      errors: [{ repo: "acme/web", message: "GitHub unavailable" }],
    });
    renderView();
    expect(await screen.findByText("#7")).toBeTruthy();
    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain("GitHub unavailable");
    expect(banner.textContent).toContain("bad artifact");
  });

  it("writes a filter change to the URL and reads the filters back from it", async () => {
    params = "status=error&range=30d";
    serve({ "": { items: [run("1", { status: "error" })], next_cursor: null } });
    renderView();
    await screen.findByText("#7");
    await waitFor(() => {
      const path = get.mock.calls.map((c) => c[0] as string).find((p) => p.startsWith("/ci/runs"));
      expect(path).toContain("status=error");
    });
    const rangeSelect = screen.getAllByRole("combobox")[0] as HTMLElement;
    fireEvent.change(rangeSelect, { target: { value: "24h" } });
    expect(replace).toHaveBeenCalledWith("/ci-runs?status=error&range=24h");
  });
});

describe("helpers", () => {
  it("falls back to the defaults for unknown params and derives `since`", () => {
    const f = parseFilters((k) => ({ range: "bogus", status: "nope" })[k] ?? null);
    expect(f).toEqual({ range: "7d", agent: "", repo: "", status: "" });
    expect(sinceFor("all")).toBe("1970-01-01T00:00:00.000Z");
    expect(sinceFor("24h", Date.parse("2026-10-02T00:00:00.000Z"))).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("sidebar", () => {
  it("lists CI Runs under GLOBAL", () => {
    const g = NAV.find((x) => x.section === "GLOBAL");
    expect(g?.items.map((i) => i.href)).toContain("/ci-runs");
  });
});
