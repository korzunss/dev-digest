/* Skill ContextTab — the skill-specific half: the mutation a change calls, the
   used-by figure, and the "serializes as" box. The list itself is covered by
   ContextDocPicker's own test. No `@testing-library/user-event` here. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillContext, SpecFile } from "@devdigest/shared";
import skillMessages from "../../../../../../../../messages/en/skills.json";
import contextMessages from "../../../../../../../../messages/en/context.json";
import { untrustedMarker } from "./helpers";

const setContextMutate = vi.fn();
const useSkillContext = vi.fn();
const useContextDocs = vi.fn();
let activeRepoId: string | null = "repo-1";
let saveFailed = false;

vi.mock("@/lib/hooks/skills", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/hooks/skills")>()),
  useSkillContext: (id: string) => useSkillContext(id),
  useSetSkillContext: () => ({ mutate: setContextMutate, isPending: false, isError: saveFailed }),
}));
vi.mock("@/lib/hooks/context", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/hooks/context")>()),
  useContextDocs: (repoId: string) => useContextDocs(repoId),
  useContextDoc: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: activeRepoId, activeRepo: null, repos: [], reposLoaded: true }),
}));

import { ContextTab } from "./ContextTab";

const SKILL = { id: "sk1", name: "pr-quality-rubric" } as Skill;

const doc = (path: string): SpecFile => ({ path, content: null, size: 120, updated_at: null, type: "specs", tokens: 10 });
const DOCS = [doc("specs/public-api.md"), doc("specs/rate-limiting.md"), doc("docs/architecture.md")];

const ctx = (paths: string[], used_by_agents = 0): SkillContext => ({
  links: paths.map((path, order) => ({ skill_id: "sk1", path, order })),
  used_by_agents,
});

function renderTab(context: SkillContext = ctx([])) {
  useContextDocs.mockReturnValue({ data: { docs: DOCS, truncated: false }, isLoading: false, isError: false, refetch: vi.fn() });
  useSkillContext.mockReturnValue({ data: context, isLoading: false, isError: false, refetch: vi.fn() });
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillMessages, context: contextMessages }}>
      <ContextTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  activeRepoId = "repo-1";
  saveFailed = false;
  setContextMutate.mockReset();
  useSkillContext.mockReset();
  useContextDocs.mockReset();
});

describe("skill ContextTab helpers", () => {
  it("spells the delimiter the engine emits, labelled with the path and escaped like the engine", () => {
    // `reviewer-core/src/prompt.ts` — `<untrusted source="${escapeLabel(path)}">`.
    expect(untrustedMarker("specs/a.md")).toBe('<untrusted source="specs/a.md">…</untrusted>');
    expect(untrustedMarker('x" evil="1>.md')).toBe(
      '<untrusted source="x&quot; evil=&quot;1&gt;.md">…</untrusted>',
    );
  });
});

describe("skill ContextTab", () => {
  it("shows the undone-change alert only after a save failed", () => {
    renderTab();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    cleanup();
    saveFailed = true;
    renderTab();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save the attached documents. Your change was undone.");
  });

  it("attaching posts the WHOLE ordered path array, new one last", () => {
    renderTab(ctx(["specs/public-api.md"]));
    fireEvent.click(screen.getByRole("checkbox", { name: "specs/rate-limiting.md" }));
    expect(setContextMutate).toHaveBeenCalledWith({
      id: "sk1",
      paths: ["specs/public-api.md", "specs/rate-limiting.md"],
    });
  });

  it("shows how many agents use the skill", () => {
    renderTab(ctx([], 3));
    expect(screen.getByText("Used by 3 agents")).toBeInTheDocument();
  });

  it("the serializes-as box names the engine's heading and wraps each path in its real label", () => {
    renderTab(ctx(["specs/public-api.md", "docs/architecture.md"]));
    expect(screen.getByText(skillMessages.context.serializesAs)).toBeInTheDocument();
    expect(screen.getByText("## Project context")).toBeInTheDocument();
    expect(screen.getByText("- specs/public-api.md")).toBeInTheDocument();
    expect(screen.getByText('<untrusted source="specs/public-api.md">…</untrusted>')).toBeInTheDocument();
    expect(screen.getByText('<untrusted source="docs/architecture.md">…</untrusted>')).toBeInTheDocument();
  });

  it("shows no heading when nothing is attached", () => {
    renderTab(ctx([]));
    expect(screen.queryByText("## Project context")).not.toBeInTheDocument();
    expect(screen.getByText(skillMessages.context.empty.title)).toBeInTheDocument();
  });

  it("asks for a repository instead of listing documents when none is active", () => {
    activeRepoId = null;
    renderTab(ctx([]));
    expect(screen.getByText(skillMessages.context.noRepo.title)).toBeInTheDocument();
    expect(useContextDocs).not.toHaveBeenCalled();
  });

  it("offers no checkboxes while the stored links load, and a retry message when they fail", () => {
    renderTab();
    const tree = (
      <NextIntlClientProvider locale="en" messages={{ skills: skillMessages, context: contextMessages }}>
        <ContextTab skill={SKILL} />
      </NextIntlClientProvider>
    );
    cleanup();
    useSkillContext.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    render(tree);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    cleanup();
    useSkillContext.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    render(tree);
    expect(screen.getByText("Could not load this skill's context documents.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
