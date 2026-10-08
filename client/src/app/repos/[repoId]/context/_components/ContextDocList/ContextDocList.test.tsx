/* ContextDocList — rows, Refresh, the two empty states, and the read-only
   promise (no Edit / Upload / New control). No user-event in this package. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SpecFile } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/context.json";
import { ContextDocList } from "./ContextDocList";

afterEach(cleanup);

const DOCS: SpecFile[] = [
  { path: "specs/api.md", type: "specs", tokens: 120, size: 400, updated_at: null },
  { path: "docs/arch.md", type: "docs", tokens: null, size: 400, updated_at: null },
];

function renderList(over: Partial<React.ComponentProps<typeof ContextDocList>> = {}) {
  const props = {
    docs: DOCS,
    truncated: false,
    cloned: true,
    selected: null,
    onSelect: vi.fn(),
    onRefresh: vi.fn(),
    ...over,
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextDocList {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("ContextDocList", () => {
  it("shows path, type and tokens per row, selects on click, refreshes, and offers no editing", () => {
    const props = renderList();

    expect(screen.getByText("specs/api.md")).toBeInTheDocument();
    expect(screen.getByText("specs")).toBeInTheDocument();
    expect(screen.getByText("120 tok")).toBeInTheDocument();
    expect(screen.getByText("2 documents")).toBeInTheDocument();

    fireEvent.click(screen.getByText("docs/arch.md"));
    expect(props.onSelect).toHaveBeenCalledWith("docs/arch.md");

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(props.onRefresh).toHaveBeenCalledTimes(1);

    expect(screen.queryByRole("button", { name: /^(edit|upload|new)/i })).not.toBeInTheDocument();
  });

  it("tells a not-cloned repo from one whose search roots match nothing", () => {
    renderList({ docs: [], cloned: false });
    expect(screen.getByText("Repository not cloned yet")).toBeInTheDocument();
    cleanup();
    renderList({ docs: [], cloned: true });
    expect(screen.getByText("No documents match the search roots")).toBeInTheDocument();
  });
});
