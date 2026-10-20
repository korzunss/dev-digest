/* RunHistory — AC-23, 23a, 24: the columns with their "—" cases, Load more through the cursor with
   the same window, a failed page keeping its rows with a retry, and View trace vs "No trace stored". */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RunHistoryItem, RunHistoryPage } from "@devdigest/shared/contracts/agent-performance.js";
import messages from "../../../../../../../../../../messages/en/agentPerformance.json";

const get = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p) },
}));
const drawer = vi.fn();
vi.mock("@/components/run-trace-drawer", () => ({
  default: (p: { runId: string; agentName: string; prNumber: number | null; endedAt: string; onClose: () => void }) => {
    drawer(p);
    return <div data-testid="drawer">{p.runId}</div>;
  },
}));

import { THIRTY_DAYS } from "@/lib/period";
import { RunHistory } from "./RunHistory";

const AGENT_ID = "00000000-0000-4000-8000-000000000001";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const item = (n: number, over: Partial<RunHistoryItem> = {}): RunHistoryItem => ({
  run_id: id(n),
  ran_at: "2026-06-01T09:14:00.000Z",
  pr_number: 482,
  tokens: 16_000,
  cost_usd: 0.06,
  cost_source: "api",
  findings_count: 3,
  source: "local",
  has_trace: true,
  ...over,
});

function renderHistory() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
        <RunHistory agentId={AGENT_ID} agentName="Security Reviewer" sel={THIRTY_DAYS} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
  drawer.mockReset();
});
afterEach(cleanup);

describe("RunHistory", () => {
  it("renders every column with its em-dash cases and opens a trace only where one is stored (AC-23, AC-24)", async () => {
    const page: RunHistoryPage = {
      items: [
        item(1),
        item(2, { pr_number: null, tokens: null, cost_usd: null, cost_source: null, findings_count: null, source: "ci", has_trace: false }),
      ],
      next_cursor: null,
    };
    get.mockResolvedValue(page);
    renderHistory();
    const rows = await screen.findAllByRole("row");
    const first = within(rows[1]!);
    expect(first.getByText("#482")).toBeInTheDocument();
    expect(first.getByText("16k")).toBeInTheDocument();
    expect(first.getByText("$0.06")).toBeInTheDocument();
    expect(first.getByText("3")).toBeInTheDocument();
    expect(first.getByText("local")).toBeInTheDocument();
    const second = within(rows[2]!);
    expect(second.getAllByText("—")).toHaveLength(4);
    expect(second.getByText("CI")).toBeInTheDocument();
    expect(second.getByText("No trace stored for this run")).toBeInTheDocument();
    expect(second.queryByRole("button", { name: "View trace" })).not.toBeInTheDocument();
    expect(screen.queryByText("Load more")).not.toBeInTheDocument();

    expect(screen.queryByTestId("drawer")).not.toBeInTheDocument();
    fireEvent.click(first.getByRole("button", { name: "View trace" }));
    expect(screen.getByTestId("drawer")).toHaveTextContent(id(1));
    expect(drawer.mock.calls[0]![0]).toMatchObject({ agentName: "Security Reviewer", prNumber: 482, endedAt: "2026-06-01T09:14:00.000Z" });
  });

  // AC-23 (Cost with its M-4 provenance): an estimated cost reads "~$0.06", a provider-reported one "$0.06"
  it("marks an estimated run cost with ~ and leaves a provider-reported one exact", async () => {
    get.mockResolvedValue({ items: [item(1, { cost_source: "api" }), item(2, { cost_source: "estimate" })], next_cursor: null });
    renderHistory();
    const rows = await screen.findAllByRole("row");
    expect(within(rows[1]!).getByText("$0.06")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("~$0.06")).toBeInTheDocument();
  });

  it("loads the next page with the same window plus the cursor, then hides Load more (AC-23a)", async () => {
    get.mockImplementation(async (path: string) =>
      path.includes("cursor=c1")
        ? { items: [item(3)], next_cursor: null }
        : { items: [item(1), item(2)], next_cursor: "c1" },
    );
    renderHistory();
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(4));
    const [firstCall, secondCall] = get.mock.calls.map((c) => new URL(c[0] as string, "http://x").searchParams);
    expect(secondCall!.get("cursor")).toBe("c1");
    expect(secondCall!.get("from")).toBe(firstCall!.get("from"));
    expect(secondCall!.get("to")).toBe(firstCall!.get("to"));
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("keeps the rows and offers a retry when a page fails (AC-23a)", async () => {
    let fail = true;
    get.mockImplementation(async (path: string) => {
      if (!path.includes("cursor=c1")) return { items: [item(1)], next_cursor: "c1" };
      if (fail) throw new Error("boom");
      return { items: [item(2)], next_cursor: null };
    });
    renderHistory();
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load more runs.");
    expect(screen.getAllByRole("row")).toHaveLength(2);
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
