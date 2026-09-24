import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, ConventionStatus } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionList } from "./ConventionList";
import { acceptedCount, bulkAction } from "./helpers";

afterEach(cleanup);

function candidate(
  id: string,
  status: ConventionStatus,
  over: Partial<ConventionCandidate> = {},
): ConventionCandidate {
  return {
    id,
    repo_id: "repo-1",
    scan_id: "scan-1",
    rule: `Rule ${id}`,
    category: "naming",
    evidence_path: `src/${id}.ts`,
    evidence_line: 10,
    evidence_end_line: 10,
    evidence_snippet: `// ${id}`,
    confidence: 0.8,
    status,
    skill_id: null,
    created_at: "2026-09-22T10:00:00.000Z",
    ...over,
  };
}

const MIXED = [candidate("a", "pending"), candidate("b", "accepted"), candidate("c", "rejected")];

function renderList(props: Partial<React.ComponentProps<typeof ConventionList>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionList
        candidates={MIXED}
        repo={{ provider: "github", api_base: null, full_name: "acme/payments-api" }}
        commitSha="9f2c1ab7e4d3"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("acceptedCount", () => {
  it("counts only what would reach the skill", () => {
    expect(acceptedCount(MIXED)).toBe(1);
    expect(acceptedCount([])).toBe(0);
  });
});

describe("bulkAction", () => {
  it("accepts what is undecided and leaves a rejection standing", () => {
    // "Select all" overturning an explicit reject would contradict the promise
    // that a rejected rule stays rejected across re-scans.
    expect(bulkAction(MIXED)).toEqual({ next: "accepted", ids: ["a"] });
  });

  it("reverses once nothing is pending", () => {
    const decided = [candidate("a", "accepted"), candidate("b", "rejected")];
    expect(bulkAction(decided)).toEqual({ next: "pending", ids: ["a"] });
  });

  it("has nothing to do when every rule was rejected", () => {
    expect(bulkAction([candidate("a", "rejected")])).toEqual({ next: "pending", ids: [] });
  });
});

describe("ConventionList", () => {
  it("renders one card per candidate", () => {
    renderList();
    expect(screen.getByText("Rule a")).toBeInTheDocument();
    expect(screen.getByText("Rule b")).toBeInTheDocument();
    expect(screen.getByText("Rule c")).toBeInTheDocument();
  });

  it("counts the accepted rules against the whole list", () => {
    renderList();
    expect(screen.getByText("1 rule accepted of 3")).toBeInTheDocument();
  });

  it("reports an empty selection rather than a bare zero", () => {
    renderList({ candidates: [candidate("a", "pending")] });
    expect(screen.getByText("No rules accepted of 1")).toBeInTheDocument();
  });

  it("selects every undecided rule at once", () => {
    const onUpdate = vi.fn();
    renderList({ onUpdate });
    fireEvent.click(screen.getByText("Select all"));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith("a", { status: "accepted" });
  });

  it("offers the way back once every rule has been decided", () => {
    const onUpdate = vi.fn();
    renderList({
      candidates: [candidate("a", "accepted"), candidate("b", "rejected")],
      onUpdate,
    });
    fireEvent.click(screen.getByText("Deselect all"));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith("a", { status: "pending" });
  });

  it("refuses to build a skill from nothing, and says why", () => {
    const onCreateSkill = vi.fn();
    renderList({ candidates: [candidate("a", "pending")], onCreateSkill });

    const create = screen.getByText("Create skill");
    expect(create).toBeDisabled();
    expect(create).toHaveAttribute("title", messages.selection.createSkillDisabled);
    fireEvent.click(create);
    expect(onCreateSkill).not.toHaveBeenCalled();
  });

  it("hands the create step to the page once a rule is accepted", () => {
    const onCreateSkill = vi.fn();
    renderList({ onCreateSkill });
    fireEvent.click(screen.getByText("Create skill"));
    expect(onCreateSkill).toHaveBeenCalledTimes(1);
  });

  it("marks only the card whose decision is in flight", () => {
    renderList({ savingId: "a" });
    expect(screen.getByText("Accepting…")).toBeInTheDocument();
    // The other undecided rows still offer the normal label.
    expect(screen.queryAllByText("Accept as Skill")).toHaveLength(1);
  });
});
