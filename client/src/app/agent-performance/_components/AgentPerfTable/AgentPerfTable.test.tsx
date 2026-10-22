/* AgentPerfTable — AC-9, 13, 15, 16: columns, no zeros for an idle agent, expand in place,
   View on every agent row but never on Deleted, header sort with aria-sort. */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/agentPerformance.json";
import { AgentPerfTable } from "./AgentPerfTable";
import { row, zeroRow } from "./fixtures";

afterEach(cleanup);

const renderTable = (rows: ReturnType<typeof row>[], sel = { period: "30d" as const }) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
      <AgentPerfTable rows={rows} sel={sel} />
    </NextIntlClientProvider>,
  );

describe("AgentPerfTable", () => {
  const sec = row("Security Reviewer", { runs: 142 });
  const idle = zeroRow("Idle Agent");
  const deleted = row(null, { runs: 4 });

  it("shows the AC-9 headers and a 'No runs in this period' row instead of zeros", () => {
    renderTable([sec, idle]);
    for (const name of ["Runs", "Avg cost", "Avg dur.", "Accept", "Last run"]) {
      expect(screen.getByRole("button", { name: `Sort by ${name}` })).toBeInTheDocument();
    }
    expect(screen.getByText("No runs in this period")).toBeInTheDocument();
    expect(screen.getByText("142")).toBeInTheDocument();
  });

  it("expands a row with runs in place and collapses it again; an idle row has no toggle", () => {
    renderTable([sec, idle]);
    const toggle = screen.getByRole("button", { name: "Show recent runs of Security Reviewer" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByText(/last 2 runs · avg 6s · \$0\.04/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide recent runs of Security Reviewer" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Hide recent runs of Security Reviewer" }));
    expect(screen.queryByText(/last 2 runs/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /recent runs of Idle Agent/ })).not.toBeInTheDocument();
  });

  it("offers View on every agent row (idle included) with the period, and none on Deleted agents", () => {
    renderTable([sec, idle, deleted], { period: "30d" });
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(screen.getByRole("link", { name: "View Idle Agent" }).getAttribute("href")).toMatch(/^\/agents\/[^?]+\?tab=stats&period=30d$/);
    expect(screen.getByText("Deleted agents")).toBeInTheDocument();
    // The Deleted row still expands.
    fireEvent.click(screen.getByRole("button", { name: "Show recent runs of Deleted agents" }));
    expect(screen.getByText(/last 2 runs/)).toBeInTheDocument();
  });

  it("View keeps a custom period in the link and does not toggle the row", () => {
    renderTable([sec], { period: "custom", from: "2026-10-01", to: "2026-10-10" } as never);
    const link = screen.getByRole("link", { name: "View Security Reviewer" });
    expect(link.getAttribute("href")).toContain("period=custom&from=2026-10-01&to=2026-10-10");
    link.addEventListener("click", (e) => e.preventDefault()); // jsdom cannot navigate
    fireEvent.click(link);
    expect(screen.queryByText(/last 2 runs/)).not.toBeInTheDocument();
  });

  it("sorts by Accept descending first and reverses on a header activation (aria-sort)", () => {
    const hi = row("Hi", { accepted: 18, dismissed: 2, accept_rate: 0.9 });
    const lo = row("Lo", { accepted: 12, dismissed: 8, accept_rate: 0.6 });
    renderTable([lo, hi]);
    const order = () => screen.getAllByRole("rowgroup").map((g) => within(g).getAllByRole("cell")[0]?.textContent);
    expect(order()).toEqual(["Hi", "Lo"]);
    const header = screen.getByRole("columnheader", { name: /Accept/ });
    expect(header).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(screen.getByRole("button", { name: "Sort by Accept" }));
    expect(order()).toEqual(["Lo", "Hi"]);
    expect(header).toHaveAttribute("aria-sort", "ascending");
  });
});
