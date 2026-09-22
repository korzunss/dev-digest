import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import skillMessages from "../../../../../../../../messages/en/skills.json";
import commonMessages from "../../../../../../../../messages/en/common.json";
import { currentVersion } from "./helpers";

const useSkillVersions = vi.fn();
const useVersionDiff = vi.fn();
const restoreMutate = vi.fn();
// Shared, not rebuilt per call: a fresh vi.fn() each render makes the retry
// button impossible to assert even deliberately.
const refetch = vi.fn();
const diffRefetch = vi.fn();

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillVersions: (id: string) => useSkillVersions(id),
  useVersionDiff: (id: string, from: number | null, to: number | null) =>
    useVersionDiff(id, from, to),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
}));

import { VersionsTab } from "./VersionsTab";

const SKILL = { id: "sk1", name: "pr-quality-rubric" } as Skill;

const v = (version: number, message: string | null): SkillVersion => ({
  skill_id: "sk1",
  version,
  body: `# body v${version}`,
  message,
  created_at: "2026-05-30T10:00:00.000Z",
});

const HISTORY = [v(3, "Tightened the scope rule"), v(2, "Added a Tests dimension"), v(1, null)];

function renderTab(versions: SkillVersion[] = HISTORY) {
  useSkillVersions.mockReturnValue({
    data: versions,
    isLoading: false,
    isError: false,
    refetch,
  });
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ skills: skillMessages, common: commonMessages }}
    >
      <VersionsTab skill={SKILL} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  useSkillVersions.mockReset();
  useVersionDiff.mockReset();
  restoreMutate.mockReset();
  refetch.mockReset();
  diffRefetch.mockReset();
  vi.restoreAllMocks();
});

const idleDiff = { data: undefined, isLoading: false, isError: false, refetch: diffRefetch };

describe("currentVersion", () => {
  it("is the highest version, not the first row", () => {
    expect(currentVersion(HISTORY)).toBe(3);
    expect(currentVersion([v(1, null), v(5, null)])).toBe(5);
  });

  it("is null for an empty history", () => {
    expect(currentVersion([])).toBeNull();
  });
});

describe("VersionsTab", () => {
  it("lists every version with its note", () => {
    useVersionDiff.mockReturnValue(idleDiff);
    renderTab();
    expect(screen.getByText("Tightened the scope rule")).toBeInTheDocument();
    expect(screen.getByText("Added a Tests dimension")).toBeInTheDocument();
  });

  it("falls back for a version written before notes existed", () => {
    useVersionDiff.mockReturnValue(idleDiff);
    renderTab();
    expect(screen.getByText(skillMessages.versions.noMessage)).toBeInTheDocument();
  });

  it("marks the newest as current and gives it no actions", () => {
    useVersionDiff.mockReturnValue(idleDiff);
    renderTab();
    expect(screen.getByText(skillMessages.versions.current)).toBeInTheDocument();
    // Two older versions ⇒ two Diff and two Restore buttons, none for current.
    expect(screen.getAllByText(skillMessages.versions.diff)).toHaveLength(2);
    expect(screen.getAllByText(skillMessages.versions.restore)).toHaveLength(2);
  });

  it("fetches no diff until a Diff button is pressed", () => {
    useVersionDiff.mockReturnValue(idleDiff);
    renderTab();
    // Third argument is the current version; the second stays null while closed.
    expect(useVersionDiff).toHaveBeenCalledWith("sk1", null, 3);
  });

  it("diffs the clicked version against the current one", () => {
    useVersionDiff.mockReturnValue(idleDiff);
    renderTab();
    fireEvent.click(screen.getAllByText(skillMessages.versions.diff)[0]!);
    expect(useVersionDiff).toHaveBeenLastCalledWith("sk1", 2, 3);
  });

  it("restores through a confirm, and does nothing when it is declined", () => {
    useVersionDiff.mockReturnValue(idleDiff);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderTab();

    fireEvent.click(screen.getAllByText(skillMessages.versions.restore)[0]!);
    expect(confirm).toHaveBeenCalled();
    expect(restoreMutate).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getAllByText(skillMessages.versions.restore)[0]!);
    expect(restoreMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sk1", version: 2 }),
    );
  });

  it("renders the empty state when there is no history at all", () => {
    useVersionDiff.mockReturnValue(idleDiff);
    renderTab([]);
    expect(screen.getByText(skillMessages.versions.empty.title)).toBeInTheDocument();
  });
});

describe("VersionsTab data states", () => {
  /** Render straight against a query state, bypassing renderTab's happy path. */
  function renderWith(state: Record<string, unknown>) {
    useSkillVersions.mockReturnValue({ data: [], isLoading: false, isError: false, refetch, ...state });
    useVersionDiff.mockReturnValue(idleDiff);
    return render(
      <NextIntlClientProvider
        locale="en"
        messages={{ skills: skillMessages, common: commonMessages }}
      >
        <VersionsTab skill={SKILL} />
      </NextIntlClientProvider>,
    );
  }

  it("shows a placeholder while the history loads", () => {
    const { container } = renderWith({ isLoading: true, data: undefined });
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    // Loading must not also claim the skill has no history.
    expect(screen.queryByText(skillMessages.versions.empty.title)).not.toBeInTheDocument();
  });

  it("reports a failed load and retries from the button", () => {
    renderWith({ isError: true });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(skillMessages.versions.loadError)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Retry"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("says so when there is only the first version to show", () => {
    // One version is not an empty history, and it is not a changelog either —
    // there is nothing to diff or restore against, and the row alone would not
    // explain why every action is missing.
    renderWith({ data: [v(1, "Initial rubric")] });
    expect(screen.getByText(skillMessages.versions.current)).toBeInTheDocument();
    expect(screen.queryByText(skillMessages.versions.diff)).not.toBeInTheDocument();
    expect(screen.queryByText(skillMessages.versions.restore)).not.toBeInTheDocument();
    expect(screen.getByText(skillMessages.versions.empty.body)).toBeInTheDocument();
  });

  it("drops that hint once a second version exists", () => {
    renderWith({ data: [v(2, "Second"), v(1, null)] });
    expect(screen.queryByText(skillMessages.versions.empty.body)).not.toBeInTheDocument();
  });

  it("reports a failed diff inside the modal, and retries there", () => {
    useSkillVersions.mockReturnValue({ data: HISTORY, isLoading: false, isError: false, refetch });
    useVersionDiff.mockReturnValue({ ...idleDiff, isError: true });
    render(
      <NextIntlClientProvider
        locale="en"
        messages={{ skills: skillMessages, common: commonMessages }}
      >
        <VersionsTab skill={SKILL} />
      </NextIntlClientProvider>,
    );

    fireEvent.click(screen.getAllByText(skillMessages.versions.diff)[0]!);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Retry"));
    expect(diffRefetch).toHaveBeenCalledTimes(1);
    // The list is still behind the modal — a failed diff is not a failed tab.
    expect(screen.getByText("Tightened the scope rule")).toBeInTheDocument();
  });
});
