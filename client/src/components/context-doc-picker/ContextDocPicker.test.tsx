/* ContextDocPicker — attach / order / filter / inherit / preview, driven the way
   an editor drives it: through the whole-list `onChange`. No
   `@testing-library/user-event` in this package (client/INSIGHTS.md). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SpecFile } from "@devdigest/shared";
import context from "../../../messages/en/context.json";
import { attachedPaths, buildRows, filterRows, totalTokens } from "./helpers";

const useContextDocs = vi.fn();
const useContextDoc = vi.fn();
vi.mock("@/lib/hooks/context", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/hooks/context")>()),
  useContextDocs: (repoId: string) => useContextDocs(repoId),
  useContextDoc: (repoId: string, path: string) => useContextDoc(repoId, path),
}));

import { ContextDocPicker } from "./ContextDocPicker";

const doc = (path: string, tokens: number | null = 100, type: SpecFile["type"] = "specs"): SpecFile => ({
  path,
  content: null,
  size: 10,
  updated_at: null,
  type,
  tokens,
});

const DOCS = [doc("specs/api.md", 100), doc("specs/rate.md", 50), doc("docs/arch.md", 25, "docs")];

const onChange = vi.fn();

function listing(docs: SpecFile[], truncated = false) {
  useContextDocs.mockReturnValue({
    data: { docs, truncated },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
}

function renderPicker(
  props: Partial<React.ComponentProps<typeof ContextDocPicker>> = {},
  docs: SpecFile[] = DOCS,
) {
  listing(docs);
  useContextDoc.mockReturnValue({
    data: { path: "x", content: "# Preview body" },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  return render(
    <NextIntlClientProvider locale="en" messages={{ context }}>
      <ContextDocPicker repoId="r1" attached={[]} onChange={onChange} {...props} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  onChange.mockReset();
  useContextDocs.mockReset();
  useContextDoc.mockReset();
});

describe("picker helpers", () => {
  it("attachedPaths reads prompt order from `order`, not the array order", () => {
    expect(
      attachedPaths([
        { path: "b.md", order: 1 },
        { path: "a.md", order: 0 },
      ]),
    ).toEqual(["a.md", "b.md"]);
    expect(attachedPaths(undefined)).toEqual([]);
  });

  it("orders attached, then inherited, then the rest, each path once", () => {
    const rows = buildRows(DOCS, ["docs/arch.md", "specs/gone.md"], [
      { path: "specs/rate.md", skillName: "rubric" },
      { path: "docs/arch.md", skillName: "rubric" },
    ]);
    expect(rows.map((r) => [r.path, r.kind])).toEqual([
      ["docs/arch.md", "attached"],
      ["specs/gone.md", "attached"],
      ["specs/rate.md", "inherited"],
      ["specs/api.md", "available"],
    ]);
    expect(rows[1]!.doc).toBeUndefined();
  });

  it("sums tokens over attached and inherited only, counting a shared path once", () => {
    const rows = buildRows(DOCS, ["specs/api.md"], [
      { path: "specs/api.md", skillName: "a" },
      { path: "docs/arch.md", skillName: "a" },
    ]);
    expect(totalTokens(rows)).toBe(125);
    expect(filterRows(rows, " API ").map((r) => r.path)).toEqual(["specs/api.md"]);
  });
});

describe("ContextDocPicker", () => {
  it("toggling a document sends the full ordered list, new one last", () => {
    renderPicker({ attached: ["docs/arch.md"] });
    fireEvent.click(screen.getByRole("checkbox", { name: "specs/api.md" }));
    expect(onChange).toHaveBeenCalledWith(["docs/arch.md", "specs/api.md"]);

    fireEvent.click(screen.getByRole("checkbox", { name: "docs/arch.md" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("ArrowDown on the handle moves an attached row down; an unattached handle is disabled", () => {
    renderPicker({ attached: ["specs/api.md", "specs/rate.md"] });
    fireEvent.keyDown(screen.getByLabelText("Reorder specs/api.md"), { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith(["specs/rate.md", "specs/api.md"]);
    expect(screen.getByLabelText("Reorder docs/arch.md")).toBeDisabled();
  });

  it("filters on a case-insensitive path substring", () => {
    renderPicker();
    fireEvent.change(screen.getByLabelText(context.picker.filterLabel), { target: { value: "API" } });
    expect(screen.getByText("specs/api.md")).toBeInTheDocument();
    expect(screen.queryByText("specs/rate.md")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(context.picker.filterLabel), { target: { value: "zzz" } });
    expect(screen.getByText(context.picker.noMatches)).toBeInTheDocument();
  });

  it("shows an inherited document ticked, disabled and labelled with its skill", () => {
    renderPicker({ inherited: [{ path: "specs/rate.md", skillName: "rubric" }] });
    const box = screen.getByRole("checkbox", { name: "specs/rate.md" });
    expect(box).toBeDisabled();
    expect(box).toBeChecked();
    expect(screen.getByText("via rubric")).toBeInTheDocument();
  });

  it("keeps an attached path the repo no longer lists, flagged", () => {
    renderPicker({ attached: ["specs/gone.md"] });
    expect(screen.getByText("specs/gone.md")).toBeInTheDocument();
    expect(screen.getByText(context.picker.notInRepo)).toBeInTheDocument();
  });

  it("counts a path attached AND inherited once in the ≈ total, and shows attached/listed", () => {
    renderPicker({
      attached: ["specs/api.md"],
      inherited: [
        { path: "specs/api.md", skillName: "rubric" },
        { path: "docs/arch.md", skillName: "rubric" },
      ],
    });
    expect(screen.getByText("≈ 125 tokens")).toBeInTheDocument();
    expect(screen.getByText("1/3 attached")).toBeInTheDocument();
  });

  it("previews a document in a modal without leaving the list", () => {
    renderPicker();
    fireEvent.click(screen.getByLabelText("Preview specs/api.md"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(useContextDoc).toHaveBeenLastCalledWith("r1", "specs/api.md");
    expect(screen.getByText("Preview body")).toBeInTheDocument();
  });

  it("sends the user to the Project Context page when the repo has no documents", () => {
    renderPicker({}, []);
    expect(screen.getByText(context.picker.empty.title)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: context.picker.empty.cta })).toHaveAttribute(
      "href",
      "/repos/r1/context",
    );
  });

  it("notes a truncated listing", () => {
    listing(DOCS, true);
    render(
      <NextIntlClientProvider locale="en" messages={{ context }}>
        <ContextDocPicker repoId="r1" attached={[]} onChange={onChange} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(context.picker.truncated)).toBeInTheDocument();
  });

  it("shows the save-failed alert only when told the save failed", () => {
    renderPicker();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    cleanup();
    renderPicker({ saveFailed: true });
    expect(screen.getByRole("alert")).toHaveTextContent(context.picker.saveFailed);
  });
});
