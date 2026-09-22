import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, Skill } from "@devdigest/shared";
import agentMessages from "../../../../../../../../messages/en/agents.json";
import skillMessages from "../../../../../../../../messages/en/skills.json";
import { attachedIds, moveId, orderedRows, toggleAttachment } from "./helpers";

const mutate = vi.fn();

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
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
});

function renderTab() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ agents: agentMessages, skills: skillMessages }}
    >
      <SkillsTab agent={AGENT} />
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

  it("appends on attach so a new skill lands last", () => {
    expect(toggleAttachment(["sk2"], "sk1")).toEqual(["sk2", "sk1"]);
  });

  it("detaches without disturbing the rest of the order", () => {
    expect(toggleAttachment(["sk2", "sk1", "sk3"], "sk1")).toEqual(["sk2", "sk3"]);
  });

  it("moves an id and leaves out-of-range moves alone", () => {
    expect(moveId(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveId(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveId(["a", "b", "c"], 0, 3)).toEqual(["a", "b", "c"]);
  });
});

describe("SkillsTab", () => {
  it("lists every workspace skill with the attached ones first", () => {
    renderTab();
    expect(screen.getByText("2 of 3 enabled")).toBeInTheDocument();
    const names = screen.getAllByText(/-rule$/).map((n) => n.textContent);
    expect(names).toEqual(["beta-rule", "alpha-rule", "gamma-rule"]);
  });

  it("attaching posts the WHOLE ordered id list, with the new one last", () => {
    renderTab();
    // Checkboxes follow row order: beta (on), alpha (on), gamma (off).
    fireEvent.click(screen.getAllByRole("checkbox")[2]!);
    expect(mutate).toHaveBeenCalledWith({
      agentId: "ag1",
      skillIds: ["sk2", "sk1", "sk3"],
    });
  });

  it("detaching posts the remaining ids in their existing order", () => {
    renderTab();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(mutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["sk1"] });
  });

  it("the arrow keys reorder — the handle is not pointer-only", () => {
    renderTab();
    fireEvent.keyDown(screen.getByLabelText("Reorder alpha-rule"), { key: "ArrowUp" });
    expect(mutate).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["sk1", "sk2"] });
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
