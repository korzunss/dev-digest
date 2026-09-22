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
    refetch: vi.fn(),
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
  vi.restoreAllMocks();
});

const idleDiff = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };

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
