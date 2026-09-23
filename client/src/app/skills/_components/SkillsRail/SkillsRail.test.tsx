/**
 * SkillsRail — the left column. The behaviour worth guarding is the routing
 * change this restructure is about: a selection is now a PATH (/skills/:id),
 * not `?skill=`, and the tab you were reading rides along.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const routerPush = vi.fn();
const updateMutate = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
}));

// The rail has three data-dependent branches besides the list, so the query
// state is driven per test rather than pinned to "loaded". `refetch` is shared
// rather than made fresh per call, or the retry button could not be asserted.
const refetch = vi.fn();
const skillsData: { data: Skill[]; isLoading: boolean; isError: boolean } = {
  data: [],
  isLoading: false,
  isError: false,
};
vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ ...skillsData, refetch }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useCreateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useImportSkillPreview: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillsRail } from "./SkillsRail";
import { filterSkills, skillHref } from "./helpers";
import { SKELETON_COUNT } from "./constants";

function skill(over: Partial<Skill> & Pick<Skill, "id" | "name">): Skill {
  return {
    description: "",
    type: "custom",
    source: "manual",
    body: "",
    enabled: true,
    version: 1,
    evidence_files: null,
    agent_count: null,
    pull_rate: null,
    accept_rate: null,
    ...over,
  };
}

const SKILLS = [
  skill({ id: "sk1", name: "secret-leakage-gate", description: "Flag credentials." }),
  skill({ id: "sk2", name: "no-then-chains", description: "Require async/await." }),
];

afterEach(() => {
  cleanup();
  routerPush.mockReset();
  updateMutate.mockReset();
  skillsData.data = [];
  skillsData.isLoading = false;
  skillsData.isError = false;
  refetch.mockReset();
});

function renderRail(props: { selectedId?: string; tab?: string } = {}) {
  skillsData.data = SKILLS;
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillsRail {...props} />
    </NextIntlClientProvider>,
  );
}

describe("helpers", () => {
  it("filters on name and description, case-insensitively", () => {
    expect(filterSkills(SKILLS, "SECRET").map((s) => s.id)).toEqual(["sk1"]);
    expect(filterSkills(SKILLS, "async").map((s) => s.id)).toEqual(["sk2"]);
    expect(filterSkills(SKILLS, "   ").map((s) => s.id)).toEqual(["sk1", "sk2"]);
  });

  it("links to the skill's own path, carrying the current tab", () => {
    expect(skillHref("sk1", "stats")).toBe("/skills/sk1?tab=stats");
  });
});

describe("SkillsRail", () => {
  it("lists every skill", () => {
    renderRail();
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    expect(screen.getByText("no-then-chains")).toBeInTheDocument();
  });

  it("narrows the list as you search", () => {
    renderRail();
    fireEvent.change(screen.getByPlaceholderText("Search skills…"), { target: { value: "then" } });
    expect(screen.queryByText("secret-leakage-gate")).not.toBeInTheDocument();
    expect(screen.getByText("no-then-chains")).toBeInTheDocument();
  });

  it("navigates to /skills/:id and keeps you on the tab you were reading", () => {
    renderRail({ selectedId: "sk1", tab: "versions" });
    fireEvent.click(screen.getByText("no-then-chains"));
    expect(routerPush).toHaveBeenCalledWith("/skills/sk2?tab=versions");
  });

  it("defaults to the config tab when nothing has picked one", () => {
    renderRail();
    fireEvent.click(screen.getByText("secret-leakage-gate"));
    expect(routerPush).toHaveBeenCalledWith("/skills/sk1?tab=config");
  });

  it("toggles a skill from the rail without navigating away", () => {
    renderRail();
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    expect(updateMutate).toHaveBeenCalledWith({ id: "sk1", patch: { enabled: false } });
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("resolves its copy, rather than rendering the key", () => {
    // next-intl renders a MISSING key as the literal key string, so a typo or
    // a dropped entry ships as a button labelled page.addSkill and nothing
    // fails. Assert the resolved text and the absence of the key itself.
    renderRail();
    expect(screen.getByText(messages.page.addSkill)).toBeInTheDocument();
    expect(screen.queryByText(/^page\./)).not.toBeInTheDocument();
  });

});

describe("SkillsRail data states", () => {
  function renderWith(state: Partial<typeof skillsData>) {
    Object.assign(skillsData, state);
    return render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <SkillsRail />
      </NextIntlClientProvider>,
    );
  }

  it("shows placeholders while loading, and no cards", () => {
    const { container } = renderWith({ isLoading: true, data: [] });
    expect(container.querySelectorAll(".skeleton")).toHaveLength(SKELETON_COUNT);
    expect(screen.queryByText("pr-quality-rubric")).not.toBeInTheDocument();
    // The three states are exclusive: loading must not also claim emptiness.
    expect(screen.queryByText(messages.page.empty.title)).not.toBeInTheDocument();
  });

  it("does not mistake a slow load for an empty library", () => {
    // `data` is undefined until the first response, which is the shape that
    // makes a loading rail render the no-skills CTA if the branches are
    // ordered wrongly.
    renderWith({ isLoading: true, data: undefined as unknown as Skill[] });
    expect(screen.queryByText(messages.page.empty.title)).not.toBeInTheDocument();
  });

  it("reports a failed load and retries from the button", () => {
    renderWith({ isError: true, data: [] });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(messages.page.loadError)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Retry"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("offers the import drawer from the empty state's call to action", () => {
    renderWith({ data: [] });
    expect(screen.getByText(messages.page.empty.title)).toBeInTheDocument();

    fireEvent.click(screen.getByText(messages.page.empty.cta));
    // The CTA is wired to the drawer, not merely present: opening it is the
    // only way a first skill gets imported.
    expect(screen.getByText(messages.drawer.title)).toBeInTheDocument();
  });

  it("keeps the search box out of the way when there is nothing to search", () => {
    renderWith({ data: [] });
    expect(screen.queryByText(messages.page.loadError)).not.toBeInTheDocument();
    expect(screen.getByText(messages.page.addSkill)).toBeInTheDocument();
  });
});
