import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrHistory } from "@devdigest/shared";
import blast from "../../../../../../../../messages/en/blast.json";

const { usePrHistoryMock } = vi.hoisted(() => ({ usePrHistoryMock: vi.fn() }));
vi.mock("@/lib/hooks/blast", () => ({ usePrHistory: usePrHistoryMock }));

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
  it("lists merged PRs with a forge link, author, date and overlap", () => {
    renderCard({
      status: "ok",
      history: [
        { pr_number: 7, title: "Fix rounding", merged_at: "2026-09-01T10:00:00Z", author: "ana", files_overlap: ["a.ts", "b.ts"], notes: "" },
      ],
    });
    expect(screen.getByRole("link", { name: "#7" })).toHaveAttribute("href", forgePrUrl(repo, 7));
    expect(screen.getByText("Fix rounding")).toBeInTheDocument();
    expect(screen.getByText("ana")).toBeInTheDocument();
    expect(screen.getByText("2026-09-01")).toBeInTheDocument();
    expect(screen.getByText("2 overlapping file(s)")).toBeInTheDocument();
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
