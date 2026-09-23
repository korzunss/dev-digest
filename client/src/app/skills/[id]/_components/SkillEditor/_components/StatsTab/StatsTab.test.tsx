import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillStats } from "@devdigest/shared";
import skillMessages from "../../../../../../../../messages/en/skills.json";
import commonMessages from "../../../../../../../../messages/en/common.json";
import { donutSegments, hasNothingToShow } from "./helpers";

const useSkillStats = vi.fn();

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillStats: (id: string) => useSkillStats(id),
}));

import { StatsTab } from "./StatsTab";

const SKILL = { id: "sk1", name: "pr-quality-rubric" } as Skill;

const STATS = (over: Partial<SkillStats> = {}): SkillStats => ({
  skill_id: "sk1",
  agent_count: 3,
  agents: [
    { id: "a1", name: "Security Reviewer" },
    { id: "a2", name: "Performance Reviewer" },
  ],
  runs_with_skill: 7,
  runs_total: 10,
  pull_rate: 0.71,
  accept_rate: 0.74,
  findings_30d: 96,
  findings_by_category: { security: 52, bug: 20 },
  ...over,
});

function renderTab() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ skills: skillMessages, common: commonMessages }}
    >
      <StatsTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

function loaded(stats: SkillStats) {
  useSkillStats.mockReturnValue({
    data: stats,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
}

afterEach(() => {
  cleanup();
  useSkillStats.mockReset();
});

describe("hasNothingToShow", () => {
  it("is true only when the skill is connected to nothing at all", () => {
    expect(hasNothingToShow(STATS({ agent_count: 0, runs_with_skill: 0 }))).toBe(true);
  });

  it("is false while an exact figure still exists", () => {
    // A skill attached to agents IS used by them, whether or not a review has
    // run yet. Hiding the tiles would suppress the one non-transitive number.
    expect(hasNothingToShow(STATS({ agent_count: 3, runs_with_skill: 0 }))).toBe(false);
    expect(hasNothingToShow(STATS({ agent_count: 0, runs_with_skill: 4 }))).toBe(false);
  });
});

describe("donutSegments", () => {
  it("orders by size and drops empty categories", () => {
    expect(donutSegments({ bug: 2, security: 9, perf: 0 }).map((s) => s.label)).toEqual([
      "security",
      "bug",
    ]);
  });

  it("is empty when nothing was found", () => {
    expect(donutSegments({})).toEqual([]);
  });
});

describe("StatsTab", () => {
  it("renders the four tiles and the agents that use the skill", () => {
    loaded(STATS());
    renderTab();

    expect(screen.getByText("USED BY")).toBeInTheDocument();
    expect(screen.getByText("71%")).toBeInTheDocument();
    expect(screen.getByText("74%")).toBeInTheDocument();
    expect(screen.getByText("96")).toBeInTheDocument();
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Performance Reviewer")).toBeInTheDocument();
  });

  it("links each agent to its Skills tab", () => {
    loaded(STATS());
    const { container } = renderTab();
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/agents/a1?tab=skills");
  });

  it("states that the transitive figures are not attribution", () => {
    // The caveat is the copy that keeps the numbers honest; losing it turns a
    // correlation into an unearned claim about the skill.
    loaded(STATS());
    renderTab();
    expect(screen.getByText(skillMessages.stats.caveat)).toBeInTheDocument();
  });

  it("renders an em dash for an unmeasured rate, never 0%", () => {
    loaded(STATS({ pull_rate: null, accept_rate: null, runs_with_skill: 0 }));
    renderTab();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("renders a measured zero as 0%", () => {
    loaded(STATS({ pull_rate: 0, accept_rate: 0 }));
    renderTab();
    expect(screen.getAllByText("0%")).toHaveLength(2);
  });

  it("keeps the tiles when there is no category breakdown yet", () => {
    loaded(STATS({ findings_by_category: {}, findings_30d: 0 }));
    renderTab();
    expect(screen.getByText("USED BY")).toBeInTheDocument();
    expect(screen.getByText(commonMessages.states.empty)).toBeInTheDocument();
  });

  it("shows the empty state only when nothing is connected", () => {
    loaded(STATS({ agent_count: 0, agents: [], runs_with_skill: 0, findings_by_category: {} }));
    renderTab();
    expect(screen.getByText(skillMessages.stats.empty.title)).toBeInTheDocument();
    expect(screen.queryByText("USED BY")).not.toBeInTheDocument();
  });

  it("offers a retry when the fetch failed", () => {
    const refetch = vi.fn();
    useSkillStats.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    renderTab();
    expect(screen.getByText(skillMessages.stats.loadError)).toBeInTheDocument();
  });
});
