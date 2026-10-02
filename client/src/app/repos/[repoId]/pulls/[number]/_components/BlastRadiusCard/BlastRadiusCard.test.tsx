/**
 * BlastRadiusCard — hooks are mocked at their submodules (`@/lib/hooks/blast`,
 * `@/lib/hooks/repo-intel`); the card only derives UI from what they return.
 * `fireEvent`, not `userEvent` (client/insights/gotchas.md).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BlastRadius } from "@devdigest/shared";
import blast from "../../../../../../../../messages/en/blast.json";

const { useBlastRadiusMock, useRepoIntelStatusMock, useResyncMock, mutateMock } = vi.hoisted(() => ({
  useBlastRadiusMock: vi.fn(),
  useRepoIntelStatusMock: vi.fn(),
  useResyncMock: vi.fn(),
  mutateMock: vi.fn(),
}));
vi.mock("@/lib/hooks/blast", () => ({ useBlastRadius: useBlastRadiusMock }));
vi.mock("@/lib/hooks/repo-intel", () => ({
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
  it("shows summary counts, links callers to the blob at the line, and toggles the list", () => {
    mockData(data());
    renderCard();

    expect(screen.getByText(blast.stat.symbols).previousSibling).toHaveTextContent("1");
    expect(screen.getByText(blast.stat.callers).previousSibling).toHaveTextContent("3");
    expect(screen.getByText(blast.stat.endpoints).previousSibling).toHaveTextContent("1");
    expect(screen.getByText(blast.stat.crons).previousSibling).toHaveTextContent("1");

    const link = screen.getByRole("link", { name: "src/routes/invoices.ts:12" });
    expect(link).toHaveAttribute("href", forgeBlobUrl(repo, "abc123", "src/routes/invoices.ts", 12));
    expect(link.getAttribute("href")).toContain("#L12");
    expect(screen.getByText("via listInvoices")).toBeInTheDocument();

    // endpoints and crons sit under their own labels
    expect(screen.getByText(blast.endpoints)).toBeInTheDocument();
    expect(screen.getByText(blast.crons)).toBeInTheDocument();
    expect(screen.getByText("GET /invoices")).toBeInTheDocument();
    expect(screen.getByText("0 3 * * *")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /formatMoney/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "src/routes/invoices.ts:12" })).not.toBeInTheDocument();
  });

  it("switches to the SVG graph and back to the tree", () => {
    mockData(data());
    renderCard();
    expect(screen.getByRole("button", { name: blast.view.tree })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("img", { name: blast.graph.ariaLabel })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: blast.view.graph }));
    expect(screen.getByRole("img", { name: blast.graph.ariaLabel })).toBeInTheDocument();
    expect(screen.getByText("GET /invoices")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "src/routes/invoices.ts:12" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: blast.view.tree }));
    expect(screen.getByRole("link", { name: "src/routes/invoices.ts:12" })).toBeInTheDocument();
  });

  it("renders the empty state when there are no downstream callers", () => {
    mockData(data({ downstream: [] }));
    renderCard();
    expect(screen.getByText("1 changed symbol(s), no downstream callers found.")).toBeInTheDocument();
    expect(screen.getByText(blast.empty)).toBeInTheDocument();
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
