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

const skillsData: { data: Skill[] } = { data: [] };
vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ ...skillsData, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useCreateSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportSkillPreview: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillsRail } from "./SkillsRail";
import { filterSkills, skillHref } from "./helpers";

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
