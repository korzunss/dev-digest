import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrHistory } from "@devdigest/shared";
import blast from "../../../../../../../../messages/en/blast.json";

const { usePrHistoryMock } = vi.hoisted(() => ({ usePrHistoryMock: vi.fn() }));
vi.mock("@/lib/hooks/blast", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/hooks/blast")>()),
  usePrHistory: usePrHistoryMock,
}));

import { forgePrUrl } from "@/lib/forge-urls";
import type { Repo } from "@/lib/types";
import { PriorPrsCard } from "./PriorPrsCard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const repo = { id: "r1", provider: "github", api_base: null, full_name: "acme/shop" } as unknown as Repo;

function renderCard(data: PrHistory) {
  usePrHistoryMock.mockReturnValue({ data, isLoading: false, isError: false });
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast }}>
      <PriorPrsCard prId="pr1" headSha="abc" repo={repo} />
    </NextIntlClientProvider>,
  );
}

describe("PriorPrsCard", () => {
  it("lists merged PRs with a forge link, avatar line and count badge; header collapses", () => {
    renderCard({
      status: "ok",
      history: [
        { pr_number: 7, title: "Fix rounding", merged_at: "2026-09-01T10:00:00Z", author: "ana", files_overlap: ["a.ts", "b.ts"], notes: "" },
        { pr_number: 8, title: "Second", merged_at: "2026-09-02T10:00:00Z", author: "bo", files_overlap: ["a.ts"], notes: "Note text" },
        { pr_number: 9, title: "Third", merged_at: "2026-09-03T10:00:00Z", author: "cy", files_overlap: ["a.ts"], notes: "" },
      ],
    });
    const header = screen.getByRole("button", { name: new RegExp(blast.history.title) });
    expect(header).toHaveTextContent("3");
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "#7" })).toHaveAttribute("href", forgePrUrl(repo, 7));
    expect(screen.getByText("Fix rounding")).toBeInTheDocument();
    expect(screen.getByText("ana·2026-09-01")).toBeInTheDocument();
    expect(screen.getByText("Note text")).toBeInTheDocument();

    fireEvent.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Fix rounding")).not.toBeInTheDocument();
  });

  it("has distinct copy for empty, unsupported and unavailable", () => {
    renderCard({ status: "ok", history: [] });
    expect(screen.getByText(blast.history.empty)).toBeInTheDocument();
    cleanup();
    renderCard({ status: "unsupported", history: [] });
    expect(screen.getByText(blast.history.unsupported)).toBeInTheDocument();
    cleanup();
    renderCard({ status: "unavailable", history: [] });
    expect(screen.getByText(blast.history.unavailable)).toBeInTheDocument();
  });
});
