import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import type { SkillStatsPeriod } from "@devdigest/shared/contracts/skill-stats.js";
import skillMessages from "../../../../../../../../messages/en/skills.json";
import perfMessages from "../../../../../../../../messages/en/agentPerformance.json";
import commonMessages from "../../../../../../../../messages/en/common.json";
import { donutSegments, hasNothingToShow } from "./helpers";

const useSkillStats = vi.fn();

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillStats: (id: string, sel: unknown) => useSkillStats(id, sel),
}));

const replace = vi.fn();
let params = "tab=stats";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/skills/sk1",
  useSearchParams: () => new URLSearchParams(params),
}));

import { StatsTab } from "./StatsTab";

const SKILL = { id: "sk1", name: "pr-quality-rubric" } as Skill;

const STATS = (over: Partial<SkillStatsPeriod> = {}): SkillStatsPeriod => ({
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
  ever_used: true,
  ...over,
});

function renderTab() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ skills: skillMessages, common: commonMessages, agentPerformance: perfMessages }}
    >
      <StatsTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

function loaded(stats: SkillStatsPeriod) {
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
  replace.mockReset();
  params = "tab=stats";
});

describe("hasNothingToShow", () => {
  it("is true only when the skill is connected to nothing at all", () => {
    expect(hasNothingToShow(STATS({ agent_count: 0, runs_with_skill: 0, ever_used: false }))).toBe(true);
  });

  it("is false while an exact figure still exists", () => {
    // A skill attached to agents IS used by them, whether or not a review has
    // run yet. Hiding the tiles would suppress the one non-transitive number.
    expect(hasNothingToShow(STATS({ agent_count: 3, runs_with_skill: 0, ever_used: false }))).toBe(false);
    // AC-47: a run that carried the skill earlier keeps the tiles, even when this period has none.
    expect(hasNothingToShow(STATS({ agent_count: 0, runs_with_skill: 0, ever_used: true }))).toBe(false);
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
    loaded(STATS({ agent_count: 0, agents: [], runs_with_skill: 0, findings_by_category: {}, ever_used: false }));
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

  it("shows the period control in every state and asks for the URL's period (AC-42)", () => {
    params = "tab=stats&period=1d";
    loaded(STATS());
    renderTab();
    expect(useSkillStats).toHaveBeenCalledWith("sk1", { period: "1d" });
    expect(screen.getByRole("button", { name: /Period: 1 day/ })).toBeInTheDocument();
  });

  it("keeps the control when the fetch failed or the skill is empty", () => {
    useSkillStats.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    renderTab();
    expect(screen.getByRole("button", { name: /Period: 30 days/ })).toBeInTheDocument();
    cleanup();
    loaded(STATS({ agent_count: 0, agents: [], runs_with_skill: 0, ever_used: false }));
    renderTab();
    expect(screen.getByRole("button", { name: /Period: 30 days/ })).toBeInTheDocument();
  });

  it("writes the picked period to the URL and keeps ?tab=", () => {
    loaded(STATS());
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /Period: 30 days/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: perfMessages.period["1d"] }));
    expect(replace).toHaveBeenCalledWith("/skills/sk1?tab=stats&period=1d");
  });

  it("labels the findings tile \"FINDINGS\" and names the period under it (AC-45)", () => {
    loaded(STATS());
    renderTab();
    expect(screen.getByText("FINDINGS")).toBeInTheDocument();
    expect(screen.queryByText(/\(30D\)/)).not.toBeInTheDocument();
    expect(screen.getAllByText(perfMessages.period["30d"]).length).toBeGreaterThanOrEqual(2);
  });

  it("shows dashes and the no-findings line when no run in the period carried the skill (AC-46)", () => {
    loaded(STATS({ runs_with_skill: 0, pull_rate: null, accept_rate: null, findings_30d: 0, findings_by_category: {}, ever_used: true }));
    renderTab();
    expect(screen.getByText("USED BY")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.getByText(skillMessages.stats.noFindingsInPeriod)).toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  // The server reports pull_rate 0 (not null) when runs exist but none carried the skill; the tab must still show "—"
  it("shows dashes, not 0%, when the period had runs but none carried the skill (AC-46)", () => {
    loaded(STATS({ runs_with_skill: 0, runs_total: 5, pull_rate: 0, accept_rate: null, findings_30d: 0, findings_by_category: {} }));
    renderTab();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.getByText(skillMessages.stats.noFindingsInPeriod)).toBeInTheDocument();
  });

  // AC-47: no agent and no run in this period, but the skill was used once: tiles, not the whole-tab empty state
  it("keeps the tiles for an unlinked skill that ran before the period (AC-47)", () => {
    loaded(STATS({ agent_count: 0, agents: [], runs_with_skill: 0, pull_rate: null, accept_rate: null, findings_30d: 0, findings_by_category: {}, ever_used: true }));
    renderTab();
    expect(screen.getByText("USED BY")).toBeInTheDocument();
    expect(screen.queryByText(skillMessages.stats.empty.title)).not.toBeInTheDocument();
  });

  it("shows no numbers while loading (AC-49)", () => {
    useSkillStats.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() });
    renderTab();
    expect(screen.queryByText("USED BY")).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});
