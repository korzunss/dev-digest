import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import type { ScopedSkill } from "@devdigest/shared/contracts/skill-scope.js";
type Skill = ScopedSkill;
import agentMessages from "../../../../../../../../messages/en/agents.json";
import skillMessages from "../../../../../../../../messages/en/skills.json";
import commonMessages from "../../../../../../../../messages/en/common.json";
import { attachedIds, orderedRows, sameOrder } from "./helpers";

const mutate = vi.fn();

// Query state is driven per test — the tab has a loading and an error branch
// besides the list. `refetch` is shared, or the retry button is unassertable.
const refetch = vi.fn();
const skillsState: { data: Skill[] | undefined; isLoading: boolean; isError: boolean } = {
  data: undefined,
  isLoading: false,
  isError: false,
};
vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ ...skillsState, refetch }),
  useAgentSkills: () => ({
    data: [
      { agent_id: "ag1", skill_id: "sk2", order: 0 },
      { agent_id: "ag1", skill_id: "sk1", order: 1 },
    ],
  }),
  useSetAgentSkills: () => ({ mutate, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

const SKILLS: Skill[] = [
  {
    id: "sk1",
    name: "alpha-rule",
    description: "Check alpha.",
    type: "convention",
    source: "manual",
    body: "# alpha",
    enabled: true,
    version: 1,
    evidence_files: null,
    paths: ["**/*.ts", "**/*.tsx"],
  },
  {
    id: "sk2",
    name: "beta-rule",
    description: "Check beta.",
    type: "security",
    source: "manual",
    body: "# beta",
    enabled: true,
    version: 1,
    evidence_files: null,
    paths: [],
  },
  {
    id: "sk3",
    name: "gamma-rule",
    description: "Check gamma.",
    type: "custom",
    source: "imported_file",
    body: "# gamma",
    enabled: false,
    version: 1,
    evidence_files: null,
    paths: [],
  },
];

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "x",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

afterEach(() => {
  cleanup();
  mutate.mockClear();
  refetch.mockReset();
  skillsState.data = SKILLS;
  skillsState.isLoading = false;
  skillsState.isError = false;
});

function renderTab(props: { onDirtyChange?: (dirty: boolean) => void } = {}) {
  skillsState.data = SKILLS;
  skillsState.isLoading = false;
  skillsState.isError = false;
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ agents: agentMessages, skills: skillMessages, common: commonMessages }}
    >
      <SkillsTab agent={AGENT} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("SkillsTab helpers", () => {
  it("reads attachment order from the links, not the array order", () => {
    expect(
      attachedIds([
        { agent_id: "a", skill_id: "second", order: 1 },
        { agent_id: "a", skill_id: "first", order: 0 },
      ]),
    ).toEqual(["first", "second"]);
  });

  it("puts attached skills first, in prompt order", () => {
    expect(orderedRows(SKILLS, ["sk2", "sk1"]).map((s) => s.id)).toEqual(["sk2", "sk1", "sk3"]);
  });
});

describe("sameOrder", () => {
  it("is order-sensitive", () => {
    expect(sameOrder(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameOrder(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameOrder(["a"], ["a", "b"])).toBe(false);
  });
});

describe("SkillsTab", () => {
  it("shows each skill's Applies to under its name, All files when unscoped", () => {
    renderTab();
    expect(screen.getByText("**/*.ts, **/*.tsx")).toBeInTheDocument();
    expect(screen.getAllByText(skillMessages.appliesTo.all)).toHaveLength(2);
  });

  it("lists every workspace skill with the attached ones first", () => {
    renderTab();
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
    const names = screen.getAllByText(/-rule$/).map((n) => n.textContent);
    expect(names).toEqual(["beta-rule", "alpha-rule", "gamma-rule"]);
  });

  it("stages edits without writing anything, then Save posts the WHOLE ordered list once", () => {
    const onDirtyChange = vi.fn();
    renderTab({ onDirtyChange });
    expect(screen.queryByText(agentMessages.skills.unsaved)).not.toBeInTheDocument();

    // Checkboxes follow row order: beta (on), alpha (on), gamma (off).
    fireEvent.click(screen.getAllByRole("checkbox")[2]!);
    expect(mutate).not.toHaveBeenCalled();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByText(agentMessages.skills.unsaved)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(agentMessages.skills.note), {
      target: { value: " add gamma " },
    });
    fireEvent.click(screen.getByRole("button", { name: agentMessages.skills.save }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({
      agentId: "ag1",
      skillIds: ["sk2", "sk1", "sk3"],
      message: "add gamma",
    });
  });

  it("detaching posts the remaining ids in their existing order", () => {
    renderTab();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByRole("button", { name: agentMessages.skills.save }));
    expect(mutate.mock.calls[0]![0]).toEqual({ agentId: "ag1", skillIds: ["sk1"] });
  });

  it("the arrow keys reorder (staged) — the handle is not pointer-only", () => {
    renderTab();
    fireEvent.keyDown(screen.getByLabelText("Reorder alpha-rule"), { key: "ArrowUp" });
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: agentMessages.skills.save }));
    expect(mutate.mock.calls[0]![0]).toEqual({ agentId: "ag1", skillIds: ["sk1", "sk2"] });
  });

  it("Cancel drops the staged edits; reverting by hand also clears the dirty state", () => {
    const onDirtyChange = vi.fn();
    renderTab({ onDirtyChange });
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByRole("button", { name: agentMessages.skills.cancel }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText(agentMessages.skills.unsaved)).not.toBeInTheDocument();
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();

    // Toggle off and on again: the order matches the stored list, so nothing to save.
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getAllByRole("checkbox")[2]!);
    expect(screen.getByText(agentMessages.skills.unsaved)).toBeInTheDocument();
  });

  it("disables Save for a note over the limit and keeps the staged edits", () => {
    renderTab();
    fireEvent.click(screen.getAllByRole("checkbox")[2]!);
    fireEvent.change(screen.getByLabelText(agentMessages.skills.note), {
      target: { value: "x".repeat(501) },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("max 500");
    expect(screen.getByRole("button", { name: agentMessages.skills.save })).toBeDisabled();
    expect(screen.getByText("3 of 3 enabled")).toBeInTheDocument();
  });

  it("measures the note after trimming, as the save sends it trimmed", () => {
    renderTab();
    fireEvent.click(screen.getAllByRole("checkbox")[2]!);
    fireEvent.change(screen.getByLabelText(agentMessages.skills.note), {
      target: { value: `${"x".repeat(500)}   ` },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: agentMessages.skills.save })).toBeEnabled();
  });

  it("does not offer reordering for a skill that is not attached", () => {
    renderTab();
    expect(screen.getByLabelText("Reorder gamma-rule")).toBeDisabled();
  });

  it("marks a globally disabled skill so its absence from the prompt is explicable", () => {
    renderTab();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });
});

describe("SkillsTab data states", () => {
  function renderWith(state: Partial<typeof skillsState>) {
    Object.assign(skillsState, { data: SKILLS, isLoading: false, isError: false }, state);
    return render(
      <NextIntlClientProvider
        locale="en"
        messages={{ agents: agentMessages, skills: skillMessages, common: commonMessages }}
      >
        <SkillsTab agent={AGENT} />
      </NextIntlClientProvider>,
    );
  }

  it("shows a placeholder while the library loads", () => {
    const { container } = renderWith({ isLoading: true, data: undefined });
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    // Loading must not read as an agent with nothing to attach.
    expect(screen.queryByText(skillMessages.page.empty.title)).not.toBeInTheDocument();
  });

  it("reports a failed load and retries from the button", () => {
    renderWith({ isError: true, data: undefined });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(skillMessages.page.loadError)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Retry"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("invites you to create one when the workspace has no skills", () => {
    renderWith({ data: [] });
    expect(screen.getByText(skillMessages.page.empty.title)).toBeInTheDocument();
  });

  it("does not claim the workspace is empty when a filter matched nothing", () => {
    // The same two nothings as everywhere else: a search that found no skill
    // is not an absence of skills, and only the second is worth acting on.
    renderWith({});
    fireEvent.change(screen.getByPlaceholderText(agentMessages.skills.filterPlaceholder), {
      target: { value: "nothing-matches-this" },
    });

    expect(screen.getByText(commonMessages.states.empty)).toBeInTheDocument();
    expect(screen.queryByText(skillMessages.page.empty.title)).not.toBeInTheDocument();
  });
});
