/**
 * SkillsListView — the /skills index, now a grid rather than a rail beside an
 * empty pane. The behaviour guarded here is what the rail used to guard on this
 * route (search, navigation, toggling, the three data states) plus the one thing
 * the grid adds: an empty library and a search that matched nothing are
 * different statements, and only the first should invite an import.
 *
 * `AppShell` is stubbed. It pulls in the repo switcher, the command palette and
 * the query client, none of which this view owns — and the shell has its own
 * smoke test. No `@testing-library/user-event` in this package (client/INSIGHTS.md).
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

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Query state is driven per test rather than pinned to "loaded", so the loading
// and error branches are reachable. `refetch` is shared rather than rebuilt per
// call, or the retry button could not be asserted.
const refetch = vi.fn();
const skillsData: { data: Skill[] | undefined; isLoading: boolean; isError: boolean } = {
  data: [],
  isLoading: false,
  isError: false,
};
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ ...skillsData, refetch }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useCreateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useImportSkillPreview: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SkillsListView } from "./SkillsListView";
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
  refetch.mockReset();
  skillsData.data = [];
  skillsData.isLoading = false;
  skillsData.isError = false;
});

function renderView(state: Partial<typeof skillsData> = {}) {
  Object.assign(skillsData, { data: SKILLS, isLoading: false, isError: false }, state);
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillsListView />
    </NextIntlClientProvider>,
  );
}

describe("SkillsListView", () => {
  it("lays the library out as a grid, one card per skill", () => {
    const { container } = renderView();
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    expect(screen.getByText("no-then-chains")).toBeInTheDocument();
    // The point of the change: a grid, not a column. Asserted on the computed
    // style rather than a class, because these styles are inline objects.
    const grid = container.querySelector('[style*="grid-template-columns"]');
    expect(grid).not.toBeNull();
  });

  it("carries the page heading and subtitle the Agents list has", () => {
    renderView();
    expect(screen.getByRole("heading", { name: messages.page.heading })).toBeInTheDocument();
    expect(screen.getByText(messages.page.subtitle)).toBeInTheDocument();
  });

  it("narrows the grid as you search", () => {
    renderView();
    fireEvent.change(screen.getByPlaceholderText(messages.page.searchPlaceholder), {
      target: { value: "then" },
    });
    expect(screen.queryByText("secret-leakage-gate")).not.toBeInTheDocument();
    expect(screen.getByText("no-then-chains")).toBeInTheDocument();
  });

  it("opens a skill on its config tab", () => {
    renderView();
    fireEvent.click(screen.getByText("secret-leakage-gate"));
    expect(routerPush).toHaveBeenCalledWith("/skills/sk1?tab=config");
  });

  it("toggles a skill in place, without navigating away", () => {
    renderView();
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    expect(updateMutate).toHaveBeenCalledWith({ id: "sk1", patch: { enabled: false } });
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("invites an import when the library is genuinely empty", () => {
    renderView({ data: [] });
    expect(screen.getByText(messages.page.empty.title)).toBeInTheDocument();

    fireEvent.click(screen.getByText(messages.page.empty.cta));
    expect(screen.getByText(messages.drawer.title)).toBeInTheDocument();
  });

  it("does not tell someone with a full library that they have no skills", () => {
    renderView();
    fireEvent.change(screen.getByPlaceholderText(messages.page.searchPlaceholder), {
      target: { value: "zzzz" },
    });
    expect(screen.getByText(messages.page.noMatches.title)).toBeInTheDocument();
    expect(screen.queryByText(messages.page.empty.title)).not.toBeInTheDocument();
    // No call to action either: importing a skill is not the answer to a
    // search that matched nothing.
    expect(screen.queryByText(messages.page.empty.cta)).not.toBeInTheDocument();
  });

  it("shows placeholders while loading, and claims nothing about the library", () => {
    const { container } = renderView({ isLoading: true, data: undefined });
    expect(container.querySelectorAll(".skeleton")).toHaveLength(SKELETON_COUNT);
    expect(screen.queryByText(messages.page.empty.title)).not.toBeInTheDocument();
    expect(screen.queryByText(messages.page.noMatches.title)).not.toBeInTheDocument();
  });

  it("reports a failed load and retries from the button", () => {
    renderView({ isError: true, data: [] });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(messages.page.loadError)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Retry"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("resolves its copy, rather than rendering the key", () => {
    // next-intl renders a MISSING key as the literal key string, so a dropped
    // entry ships as a button labelled page.addSkill and nothing fails.
    renderView();
    expect(screen.getByText(messages.page.addSkill)).toBeInTheDocument();
    expect(screen.queryByText(/^page\./)).not.toBeInTheDocument();
  });
});
