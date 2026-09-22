import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillContextLink, SpecFile } from "@devdigest/shared";
import skillMessages from "../../../../../../../../messages/en/skills.json";
import commonMessages from "../../../../../../../../messages/en/common.json";
import { attachedPaths, docFolder, docName, filterDocs, folderTag, orderedDocs } from "./helpers";

const setContextMutate = vi.fn();
const useSkillContext = vi.fn();
const useContextDocs = vi.fn();

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useContextDocs: (repoId: string | null) => useContextDocs(repoId),
  useSkillContext: (id: string) => useSkillContext(id),
  useSetSkillContext: () => ({ mutate: setContextMutate, isPending: false }),
  useContextDoc: () => ({ data: undefined, isLoading: false, isError: false }),
}));

vi.mock("../../../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "repo-1", activeRepo: null, repos: [], reposLoaded: true }),
}));

import { ContextTab } from "./ContextTab";

const SKILL = { id: "sk1", name: "pr-quality-rubric" } as Skill;

const doc = (path: string): SpecFile => ({ path, content: null, size: 120, updated_at: null });

const DOCS: SpecFile[] = [
  doc("specs/public-api.md"),
  doc("specs/rate-limiting.md"),
  doc("docs/architecture.md"),
];

const link = (path: string, order: number): SkillContextLink => ({
  skill_id: "sk1",
  path,
  order,
});

function renderTab(links: SkillContextLink[] = [], docs: SpecFile[] = DOCS) {
  useContextDocs.mockReturnValue({
    data: docs,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  useSkillContext.mockReturnValue({ data: links });
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ skills: skillMessages, common: commonMessages }}
    >
      <ContextTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  setContextMutate.mockReset();
  useSkillContext.mockReset();
  useContextDocs.mockReset();
});

describe("ContextTab helpers", () => {
  it("reads attachment order from the links, not the array order", () => {
    expect(attachedPaths([link("b.md", 1), link("a.md", 0)])).toEqual(["a.md", "b.md"]);
  });

  it("floats attached documents to the top in prompt order", () => {
    const ordered = orderedDocs(DOCS, ["docs/architecture.md", "specs/public-api.md"]);
    expect(ordered.map((d) => d.path)).toEqual([
      "docs/architecture.md",
      "specs/public-api.md",
      "specs/rate-limiting.md",
    ]);
  });

  it("drops an attached path the repo no longer lists", () => {
    // A link stores a path, not an id, so it can outlive the file it names.
    const ordered = orderedDocs(DOCS, ["specs/gone.md", "specs/public-api.md"]);
    expect(ordered.map((d) => d.path)).toEqual([
      "specs/public-api.md",
      "specs/rate-limiting.md",
      "docs/architecture.md",
    ]);
  });

  it("splits a path into its parts", () => {
    expect(docName("specs/api/public.md")).toBe("public.md");
    expect(docFolder("specs/api/public.md")).toBe("specs/api/");
    expect(folderTag("specs/api/public.md")).toBe("specs");
  });

  it("filters on the path", () => {
    expect(filterDocs(DOCS, "rate").map((d) => d.path)).toEqual(["specs/rate-limiting.md"]);
    expect(filterDocs(DOCS, "  ")).toHaveLength(3);
  });
});

describe("ContextTab", () => {
  it("lists every document with the attached ones first", () => {
    renderTab([link("docs/architecture.md", 0)]);
    const names = screen.getAllByText(/\.md$/).map((n) => n.textContent);
    expect(names[0]).toBe("architecture.md");
    expect(names).toContain("public-api.md");
  });

  it("attaching posts the WHOLE ordered path array, new one last", () => {
    renderTab([link("specs/public-api.md", 0)]);
    // Row order is attached-first, so index 1 is the first unattached document.
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    expect(setContextMutate).toHaveBeenCalledWith({
      id: "sk1",
      paths: ["specs/public-api.md", "specs/rate-limiting.md"],
    });
  });

  it("detaching posts the remaining paths in their existing order", () => {
    renderTab([link("specs/public-api.md", 0), link("docs/architecture.md", 1)]);
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(setContextMutate).toHaveBeenCalledWith({
      id: "sk1",
      paths: ["docs/architecture.md"],
    });
  });

  it("the arrow keys reorder — the handle is not pointer-only", () => {
    renderTab([link("specs/public-api.md", 0), link("docs/architecture.md", 1)]);
    fireEvent.keyDown(screen.getByLabelText("Reorder docs/architecture.md"), { key: "ArrowUp" });
    expect(setContextMutate).toHaveBeenCalledWith({
      id: "sk1",
      paths: ["docs/architecture.md", "specs/public-api.md"],
    });
  });

  it("does not offer reordering for an unattached document", () => {
    renderTab([]);
    expect(screen.getByLabelText("Reorder specs/public-api.md")).toBeDisabled();
  });

  it("the serializes-as box names the engine's real heading and every attached path", () => {
    renderTab([link("specs/public-api.md", 0), link("docs/architecture.md", 1)]);
    expect(screen.getByText(skillMessages.context.serializesAs)).toBeInTheDocument();
    expect(screen.getByText("## Project context")).toBeInTheDocument();
    expect(screen.getByText("- specs/public-api.md")).toBeInTheDocument();
    expect(screen.getByText("- docs/architecture.md")).toBeInTheDocument();
  });

  it("says so rather than showing an empty heading when nothing is attached", () => {
    renderTab([]);
    expect(screen.queryByText("## Project context")).not.toBeInTheDocument();
  });

  it("distinguishes a repo with no documents from nothing being attached", () => {
    // Three different nothings share no copy: "no documents in this repo" is
    // not "no context attached", and reusing one string for both told the user
    // the wrong thing about which action to take.
    renderTab([], []);
    expect(screen.getByText(skillMessages.context.noDocs.title)).toBeInTheDocument();
    expect(screen.queryByText(skillMessages.context.noDocs.title)).not.toBe(null);
  });
});
