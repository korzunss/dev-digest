/**
 * SkillEditor — the six-tab shell. What matters here is that `?tab=` selects
 * the pane (the page hands the value straight through after whitelisting it),
 * that every pane renders (each of the six is exercised here, the data-driven
 * ones through their empty state), and that the tab bar is in the designed
 * order.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ScopedSkill } from "@devdigest/shared/contracts/skill-scope.js";
import messages from "../../../../../../messages/en/skills.json";
import evalMessages from "../../../../../../messages/en/eval.json";
import common from "../../../../../../messages/en/common.json";
import perfMessages from "../../../../../../messages/en/agentPerformance.json";
import { ToastProvider } from "../../../../../lib/toast";

// Every pane reads through this module, so the shell test has to stand in for
// all of it. The three panes below are handed nothing — no repo, no stats, no
// versions — which is how each one's empty state gets exercised here; their
// real behaviour is covered by their own tests.
vi.mock("../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useContextDocs: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useContextDoc: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useSkillContext: () => ({ data: [] }),
  useSetSkillContext: () => ({ mutate: vi.fn(), isPending: false }),
  useSkillStats: () => ({
    data: {
      skill_id: "sk1",
      agent_count: 0,
      agents: [],
      runs_with_skill: 0,
      runs_total: 0,
      pull_rate: null,
      accept_rate: null,
      findings_30d: 0,
      findings_by_category: {},
      ever_used: false,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSkillVersions: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
  useVersionDiff: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: vi.fn(), isPending: false }),
}));

const evalSuite = vi.hoisted(() => ({ cases: [] as unknown[] }));

// The Evals pane reads the skill's (empty) suite through the eval hooks.
vi.mock("@/lib/hooks/eval", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/hooks/eval")>()),
  useSkillEvalCases: () => ({ data: evalSuite.cases, isLoading: false, isError: false, refetch: vi.fn() }),
  useSkillEvalRunState: () => ({ data: { skill: { id: "sk1", name: "n", version: 3, enabled: true }, progress: null, default_pick: null } }),
  useStartSkillEvalRun: () => ({ mutate: vi.fn(), isPending: false }),
  useRunEvalCase: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteEvalCase: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/skills/sk1",
  useSearchParams: () => new URLSearchParams("tab=stats"),
}));

import { SkillEditor } from "./SkillEditor";
import { DEFAULT_TAB, TABS, VALID_TABS } from "./constants";

const SKILL: ScopedSkill = {
  id: "sk1",
  name: "secret-leakage-gate",
  description: "Flag hardcoded credentials before they reach main.",
  type: "security",
  source: "manual",
  body: "# Rule\n\nNo **sk_live** keys.",
  enabled: true,
  version: 3,
  paths: [],
  evidence_files: null,
  agent_count: 2,
  pull_rate: 0.4,
  accept_rate: 0.7,
};

afterEach(cleanup);

function renderEditor(tab: string, onTab = vi.fn(), skill: ScopedSkill = SKILL) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages, eval: evalMessages, common, agentPerformance: perfMessages }}>
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <SkillEditor skill={skill} tab={tab} onTab={onTab} />
        </ToastProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return onTab;
}

describe("tab constants", () => {
  it("keeps the whitelist derived from the tab list, in the designed order", () => {
    expect(VALID_TABS).toEqual(["config", "context", "preview", "evals", "stats", "versions"]);
    expect(TABS.map((t) => t.key)).toEqual(VALID_TABS);
    expect(VALID_TABS).toContain(DEFAULT_TAB);
  });
});

describe("SkillEditor", () => {
  it("renders every tab label", () => {
    renderEditor("config");
    for (const label of ["Config", "Context", "Preview", "Evals", "Stats", "Versions"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders the Config pane for ?tab=config", () => {
    renderEditor("config");
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save skill")).toBeInTheDocument();
  });

  it("renders the Preview pane for ?tab=preview", () => {
    renderEditor("preview");
    expect(screen.getByText("Rendered as the reviewing agent receives it.")).toBeInTheDocument();
    // The body goes through the Markdown primitive, so the bold survives.
    expect(screen.getByText("sk_live").tagName).toBe("STRONG");
    expect(screen.queryByText("Save skill")).not.toBeInTheDocument();
  });

  it("renders the skill's eval suite pane, not a placeholder", () => {
    renderEditor("evals");
    expect(screen.getByText("Eval cases")).toBeInTheDocument();
    expect(screen.getByText("New eval case")).toBeInTheDocument();
  });

  it("names a disabled skill in the single-case Run confirm, and not an enabled one (AC-93)", () => {
    const kase = {
      id: "c1", agent_id: null, skill_id: "sk1", name: "leaks a key", input: { diff: "d", files: [], pr_meta: null },
      expected: [], source: { finding_id: null, pr_id: null }, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
      last_result: null,
    };
    evalSuite.cases = [kase];
    try {
      const { unmount } = render(
        <NextIntlClientProvider locale="en" messages={{ skills: messages, eval: evalMessages, common, agentPerformance: perfMessages }}>
          <QueryClientProvider client={new QueryClient()}>
            <ToastProvider>
              <SkillEditor skill={{ ...SKILL, enabled: false }} tab="evals" onTab={vi.fn()} />
            </ToastProvider>
          </QueryClientProvider>
        </NextIntlClientProvider>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Run" }));
      expect(within(screen.getByRole("dialog")).getByText(/This skill is disabled/)).toBeInTheDocument();
      unmount();

      renderEditor("evals");
      fireEvent.click(screen.getByRole("button", { name: "Run" }));
      expect(screen.queryByText(/This skill is disabled/)).not.toBeInTheDocument();
    } finally {
      evalSuite.cases = [];
    }
  });

  it.each([
    // No RepoProvider wraps this shell test, so the active repo is null — and
    // "no repository selected" is the honest state for that, distinct from
    // "no documents in the repo" and from "none attached".
    ["context", "No repository selected"],
    ["stats", "No runs with this skill yet"],
    ["versions", "Only one version so far"],
  ])("renders the %s pane's empty state", (tab, title) => {
    renderEditor(tab);
    expect(screen.getByText(title)).toBeInTheDocument();
  });

  it("falls back to Config when the tab is not one it knows", () => {
    // The route whitelists ?tab=, but the pane map must not render blank if
    // something ever slips past it.
    renderEditor("nonsense");
    expect(screen.getByText("Configuration")).toBeInTheDocument();
  });

  it("reports a tab click instead of holding the selection itself", () => {
    // Tab state lives in the URL; the editor is controlled.
    const onTab = renderEditor("config");
    fireEvent.click(screen.getByText("Versions"));
    expect(onTab).toHaveBeenCalledWith("versions");
  });
});
