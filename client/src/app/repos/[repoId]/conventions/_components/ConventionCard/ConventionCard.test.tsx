import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";
import { confidenceColor, confidencePct, evidenceLabel } from "./helpers";

afterEach(cleanup);

const SHA = "9f2c1ab7e4d3";

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  repo_id: "repo-1",
  scan_id: "scan-1",
  rule: "Always use async/await instead of .then() chains.",
  category: "async",
  evidence_path: "src/api/users.ts",
  evidence_line: 23,
  evidence_end_line: 31,
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.92,
  status: "pending",
  skill_id: null,
  created_at: "2026-09-22T10:00:00.000Z",
};

function renderCard(props: Partial<React.ComponentProps<typeof ConventionCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard
        candidate={CANDIDATE}
        repoFullName="acme/payments-api"
        commitSha={SHA}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("evidenceLabel", () => {
  it("shows a range only when the evidence spans one", () => {
    expect(evidenceLabel(CANDIDATE)).toBe("src/api/users.ts:23-31");
    expect(evidenceLabel({ ...CANDIDATE, evidence_end_line: 23 })).toBe("src/api/users.ts:23");
  });
});

describe("confidence", () => {
  it("clamps a rate the contract should have bounded", () => {
    expect(confidencePct(0.92)).toBe(92);
    expect(confidencePct(1.4)).toBe(100);
    expect(confidencePct(-1)).toBe(0);
    expect(confidencePct(Number.NaN)).toBe(0);
  });

  it("colours the bar on the same thresholds the confidence number uses", () => {
    expect(confidenceColor(92)).toBe("var(--ok)");
    expect(confidenceColor(70)).toBe("var(--warn)");
    expect(confidenceColor(40)).toBe("var(--text-muted)");
  });
});

describe("ConventionCard", () => {
  it("renders the rule, its category and its confidence", () => {
    renderCard();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("Async")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
  });

  it("shows the cited code, not just the path", () => {
    renderCard();
    expect(screen.getByText("const user = await db.users.find(id);")).toBeInTheDocument();
  });

  it("links the evidence to the scanned commit, not to a branch", () => {
    // The whole point of storing `commit_sha` on the scan: `main` drifts off
    // the cited line the next time someone pushes.
    renderCard();
    const link = screen.getByText("src/api/users.ts:23-31");
    expect(link).toHaveAttribute(
      "href",
      `https://github.com/acme/payments-api/blob/${SHA}/src/api/users.ts#L23-L31`,
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders no link when the scan recorded no commit", () => {
    renderCard({ commitSha: null });
    expect(screen.getByText("src/api/users.ts:23-31").closest("a")).toBeNull();
  });

  it("accepts a pending candidate", () => {
    const onUpdate = vi.fn();
    renderCard({ onUpdate });
    fireEvent.click(screen.getByText("Accept as Skill"));
    expect(onUpdate).toHaveBeenCalledWith({ status: "accepted" });
  });

  it("takes an acceptance back rather than re-accepting", () => {
    const onUpdate = vi.fn();
    renderCard({ candidate: { ...CANDIDATE, status: "accepted" }, onUpdate });
    fireEvent.click(screen.getByText("Accepted"));
    expect(onUpdate).toHaveBeenCalledWith({ status: "pending" });
  });

  it("rejects a candidate", () => {
    const onUpdate = vi.fn();
    renderCard({ onUpdate });
    fireEvent.click(screen.getByText("Reject"));
    expect(onUpdate).toHaveBeenCalledWith({ status: "rejected" });
  });

  it("holds both decisions while one is being written", () => {
    const onUpdate = vi.fn();
    renderCard({ onUpdate, saving: true });
    fireEvent.click(screen.getByText("Accepting…"));
    fireEvent.click(screen.getByText("Reject"));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("edits the rule in place and saves the new wording", () => {
    const onUpdate = vi.fn();
    renderCard({ onUpdate });
    fireEvent.click(screen.getByTitle("Edit"));

    const input = screen.getByLabelText("Edit");
    fireEvent.change(input, { target: { value: "  Prefer async/await over .then() chains.  " } });
    fireEvent.click(screen.getByText("Save"));

    expect(onUpdate).toHaveBeenCalledWith({ rule: "Prefer async/await over .then() chains." });
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
  });

  it("writes nothing when the edit leaves the rule as it was", () => {
    const onUpdate = vi.fn();
    renderCard({ onUpdate });
    fireEvent.click(screen.getByTitle("Edit"));
    fireEvent.click(screen.getByText("Save"));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("refuses to save an empty rule", () => {
    const onUpdate = vi.fn();
    renderCard({ onUpdate });
    fireEvent.click(screen.getByTitle("Edit"));
    fireEvent.change(screen.getByLabelText("Edit"), { target: { value: "   " } });
    fireEvent.click(screen.getByText("Save"));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("cancelling an edit leaves the rule alone", () => {
    const onUpdate = vi.fn();
    renderCard({ onUpdate });
    fireEvent.click(screen.getByTitle("Edit"));
    fireEvent.change(screen.getByLabelText("Edit"), { target: { value: "something else" } });
    fireEvent.click(screen.getByText("Cancel"));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
  });
});
