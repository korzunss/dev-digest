/* DocPreview — the states a document can be in, and that a hostile document
   cannot inject script. No `@testing-library/user-event` here (client/INSIGHTS.md). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import context from "../../../messages/en/context.json";
import { ApiError } from "@/lib/api";

const useContextDoc = vi.fn();
vi.mock("@/lib/hooks/context", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/hooks/context")>()),
  useContextDoc: (repoId: string, path: string) => useContextDoc(repoId, path),
}));

import { DocPreview } from "./DocPreview";

const refetch = vi.fn();

function state(over: Record<string, unknown> = {}) {
  useContextDoc.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch,
    ...over,
  });
}

function renderPreview() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context }}>
      <DocPreview repoId="r1" path="specs/a.md" />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  useContextDoc.mockReset();
  refetch.mockReset();
});

describe("DocPreview", () => {
  it("renders the document as Markdown", () => {
    state({ data: { path: "specs/a.md", content: "# Title\n\nSome **bold** text." } });
    renderPreview();
    expect(useContextDoc).toHaveBeenCalledWith("r1", "specs/a.md");
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();
  });

  it("shows a placeholder while loading", () => {
    state({ isLoading: true });
    const { container } = renderPreview();
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("offers a retry on a failed read", () => {
    state({ isError: true, error: new ApiError("boom", 500) });
    renderPreview();
    expect(screen.getByText(context.preview.loadError)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("explains a refused document (422) without offering a pointless retry", () => {
    state({ isError: true, error: new ApiError("too large", 422) });
    renderPreview();
    expect(screen.getByText(context.preview.refused)).toBeInTheDocument();
    expect(screen.queryByText("Retry")).not.toBeInTheDocument();
  });

  it("never turns hostile Markdown into script, handlers or live URLs", () => {
    state({
      data: {
        path: "specs/a.md",
        content: [
          "<script>alert(1)</script>",
          "",
          "<img src=x onerror=alert(1)>",
          "",
          "[x](javascript:alert(1))",
          "",
          "![y](data:text/html,x)",
        ].join("\n"),
      },
    });
    const { container } = renderPreview();

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
    const link = screen.queryByText("x");
    const href = link?.closest("a")?.getAttribute("href");
    expect(href === null || href === undefined || href === "").toBe(true);
    const img = container.querySelector("img");
    const src = img?.getAttribute("src");
    expect(src === null || src === undefined || src === "").toBe(true);
  });
});
