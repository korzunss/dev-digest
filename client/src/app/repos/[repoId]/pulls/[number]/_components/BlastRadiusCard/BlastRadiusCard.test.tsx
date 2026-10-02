/**
 * BlastRadiusCard — hooks are mocked at their submodules (`@/lib/hooks/blast`,
 * `@/lib/hooks/repo-intel`); the card only derives UI from what they return.
 * `fireEvent`, not `userEvent` (client/insights/gotchas.md).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BlastRadius } from "@devdigest/shared";
import blast from "../../../../../../../../messages/en/blast.json";

const { useBlastRadiusMock, usePrHistoryMock, useRepoIntelStatusMock, useResyncMock, mutateMock } = vi.hoisted(() => ({
  useBlastRadiusMock: vi.fn(),
  usePrHistoryMock: vi.fn(),
  useRepoIntelStatusMock: vi.fn(),
  useResyncMock: vi.fn(),
  mutateMock: vi.fn(),
}));
vi.mock("@/lib/hooks/blast", async () => ({
  ...(await vi.importActual<typeof import("@/lib/hooks/blast")>("@/lib/hooks/blast")),
  useBlastRadius: useBlastRadiusMock,
  usePrHistory: usePrHistoryMock,
}));
vi.mock("@/lib/hooks/repo-intel", async () => ({
  ...(await vi.importActual<typeof import("@/lib/hooks/repo-intel")>("@/lib/hooks/repo-intel")),
  useRepoIntelStatus: useRepoIntelStatusMock,
  useResyncRepoIntel: useResyncMock,
}));

import { forgeBlobUrl } from "@/lib/forge-urls";
import type { Repo } from "@/lib/types";
import { BlastRadiusCard } from "./BlastRadiusCard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const repo = { id: "r1", provider: "github", api_base: null, full_name: "acme/shop" } as unknown as Repo;

function data(over: Partial<BlastRadius> = {}): BlastRadius {
  return {
    changed_symbols: [{ name: "formatMoney", file: "src/lib/money.ts", kind: "function", rank: 0.5 }],
    downstream: [
      {
        symbol: "formatMoney",
        rank: 0.5,
        callers: [
          { name: "listInvoices", file: "src/routes/invoices.ts", line: 12, depth: 1, via: null },
          { name: "nightly", file: "src/jobs/nightly.ts", line: 4, depth: 1, via: null },
          { name: "render", file: "src/ui/page.ts", line: 9, depth: 2, via: "listInvoices" },
        ],
        endpoints_affected: ["GET /invoices"],
        crons_affected: ["0 3 * * *"],
      },
    ],
    summary: "",
    degraded: false,
    reason: null,
    limits: { callers_per_symbol: 20, depth: 2 },
    ...over,
  };
}

function mockData(d: BlastRadius | undefined, flags: { isLoading?: boolean; isError?: boolean } = {}) {
  useBlastRadiusMock.mockReturnValue({ data: d, isLoading: false, isError: false, ...flags });
  usePrHistoryMock.mockReturnValue({
    data: {
      status: "ok",
      history: [{ pr_number: 7, title: "Fix rounding", merged_at: "2026-09-01T10:00:00Z", author: "ana", files_overlap: ["a.ts"], notes: "" }],
    },
    isLoading: false,
    isError: false,
  });
  useRepoIntelStatusMock.mockReturnValue({ data: { updatedAt: "t0" } });
  useResyncMock.mockReturnValue({ mutate: mutateMock, isPending: false, isError: false });
}

function renderCard() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ blast }}>
        <BlastRadiusCard prId="pr1" headSha="abc123" repo={repo} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("BlastRadiusCard", () => {
  it("renders the heading, stat plurals, symbol row, call-site rows and chips", () => {
    mockData(
      data({
        downstream: [
          {
            symbol: "formatMoney",
            rank: 0.5,
            callers: [
              { name: "listInvoices", file: "src/routes/invoices.ts", line: 12, depth: 1, via: null },
              { name: "other", file: "src/routes/invoices.ts", line: 40, depth: 1, via: null },
              { name: "nightly", file: "src/jobs/nightly.ts", line: 4, depth: 1, via: null },
              { name: "render", file: "src/ui/page.ts", line: 9, depth: 2, via: "listInvoices" },
            ],
            endpoints_affected: ["GET /invoices"],
            crons_affected: ["0 3 * * *"],
          },
        ],
      }),
    );
    renderCard();

    expect(screen.getByText(blast.title)).toBeInTheDocument();
    expect(screen.getByText("symbol")).toBeInTheDocument();
    expect(screen.getByText("symbol").previousSibling).toHaveTextContent("1");
    expect(screen.getByText("callers").previousSibling).toHaveTextContent("4");
    expect(screen.getByText("endpoint").previousSibling).toHaveTextContent("1");
    expect(screen.getByText("cron").previousSibling).toHaveTextContent("1");

    const group = screen.getByRole("group");
    expect(within(group).getByRole("button", { name: "tree" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "graph" })).toHaveAttribute("aria-pressed", "false");

    expect(screen.getByText("formatMoney()")).toBeInTheDocument();
    expect(screen.getByText("4 callers")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "src/routes/invoices.ts:12" });
    expect(link).toHaveAttribute("href", forgeBlobUrl(repo, "abc123", "src/routes/invoices.ts", 12));
    expect(link.getAttribute("href")).toContain("#L12");
    // two call sites in one file render two rows
    expect(screen.getByRole("link", { name: "src/routes/invoices.ts:40" })).toBeInTheDocument();
    expect(link.parentElement).toHaveAttribute("title", "listInvoices");
    expect(screen.getByRole("link", { name: "src/ui/page.ts:9" }).parentElement).toHaveAttribute("title", "via listInvoices");

    // endpoint and cron chips are separate elements
    const ep = screen.getByText("GET /invoices");
    const cron = screen.getByText("0 3 * * *");
    expect(ep.parentElement).not.toBe(cron.parentElement);

    const toggle = screen.getByRole("button", { name: /formatMoney/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "src/routes/invoices.ts:12" })).not.toBeInTheDocument();
  });

  it("renders the Prior PRs panel inside the card frame", () => {
    mockData(data());
    const { container } = renderCard();
    const card = container.firstElementChild as HTMLElement;
    expect(within(card).getByText(blast.history.title)).toBeInTheDocument();
    expect(within(card).getByText("Fix rounding")).toBeInTheDocument();
  });

  it("switches to the SVG graph and back to the tree", () => {
    mockData(data());
    renderCard();
    expect(screen.getByRole("button", { name: "tree" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("img", { name: blast.graph.ariaLabel })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "graph" }));
    expect(screen.getByRole("img", { name: blast.graph.ariaLabel })).toBeInTheDocument();
    const svg = screen.getByRole("img", { name: blast.graph.ariaLabel });
    expect(svg.querySelector("text")).not.toBeNull();
    expect(within(svg as unknown as HTMLElement).getAllByText("GET /invoices").length).toBeGreaterThan(0);
    expect(svg.querySelectorAll("rect").length).toBeGreaterThan(0);
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
    const rightEdges = new Set(
      [...svg.querySelectorAll("rect")].map((r) => Number(r.getAttribute("x")) + Number(r.getAttribute("width"))),
    );
    for (const p of svg.querySelectorAll("path")) {
      expect(rightEdges.has(Number(/^M(\S+)/.exec(p.getAttribute("d") ?? "")?.[1]))).toBe(true);
    }
    for (const label of [blast.graph.legendSymbol, blast.graph.legendCaller, blast.graph.legendEndpoint, blast.graph.legendCron]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.queryByRole("link", { name: "src/routes/invoices.ts:12" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "tree" }));
    expect(screen.getByRole("link", { name: "src/routes/invoices.ts:12" })).toBeInTheDocument();
  });

  it("renders the empty state when there are no downstream callers", () => {
    mockData(data({ downstream: [] }));
    renderCard();
    expect(screen.getByText("1 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
    expect(screen.getByText(blast.empty)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "graph" })).toBeDisabled();
  });

  it("shows the degraded badge with its reason and starts a resync on click", () => {
    mockData(data({ degraded: true, reason: "no_data" }));
    renderCard();
    expect(screen.getByText(blast.degraded.badge)).toBeInTheDocument();
    expect(screen.getByText(blast.degraded.reason.no_data)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: blast.degraded.resync }));
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });

  // a healthy index shows no degraded notice and no resync button
  it("hides the degraded notice when the result is not degraded", () => {
    mockData(data({ degraded: false, reason: null }));
    renderCard();
    expect(screen.queryByText(blast.degraded.badge)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: blast.degraded.resync })).not.toBeInTheDocument();
  });

  // the notice renders the reason it was given, not a fixed one
  it("shows the copy for the reason passed through (index_failed)", () => {
    mockData(data({ degraded: true, reason: "index_failed" }));
    renderCard();
    expect(screen.getByText(blast.degraded.reason.index_failed)).toBeInTheDocument();
    expect(screen.queryByText(blast.degraded.reason.no_data)).not.toBeInTheDocument();
  });

  it("shows the load error", () => {
    mockData(undefined, { isError: true });
    renderCard();
    expect(screen.getByRole("alert")).toHaveTextContent(blast.loadError);
  });
});
