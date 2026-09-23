import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";
import { formatCount, formatRate, needsVetting } from "./helpers";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "secret-leakage-gate",
  description: "Flag hardcoded credentials before they reach main.",
  type: "security",
  source: "manual",
  body: "# Rule\nNo sk_live keys.",
  enabled: true,
  version: 1,
  evidence_files: null,
  // The rail's rollups. Nullish is the normal state for a skill no run has
  // touched yet, which is exactly the case the footer must not misreport.
  agent_count: null,
  pull_rate: null,
  accept_rate: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("needsVetting", () => {
  it("trusts only a skill written here", () => {
    expect(needsVetting({ source: "manual" })).toBe(false);
    expect(needsVetting({ source: "imported_file" })).toBe(true);
    expect(needsVetting({ source: "imported_url" })).toBe(true);
    expect(needsVetting({ source: "community" })).toBe(true);
  });
});

describe("rollup formatting", () => {
  it("renders an unmeasured figure as an em dash, never as zero", () => {
    // "never pulled" and "pulled, nothing accepted" are different facts; only
    // the second one is a 0%.
    expect(formatCount(null)).toBe("—");
    expect(formatCount(undefined)).toBe("—");
    expect(formatRate(null)).toBe("—");
    expect(formatRate(undefined)).toBe("—");
    expect(formatRate(Number.NaN)).toBe("—");
  });

  it("renders a measured zero as zero", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatRate(0)).toBe("0%");
  });

  it("renders a rate as a whole percentage", () => {
    expect(formatRate(0.42)).toBe("42%");
    expect(formatRate(1)).toBe("100%");
  });
});

describe("SkillCard", () => {
  it("renders the name, type and description", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("secret-leakage-gate")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(
      screen.getByText("Flag hardcoded credentials before they reach main."),
    ).toBeInTheDocument();
  });

  it("badges an imported skill as needing vetting", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, source: "imported_file", enabled: false }} />);
    expect(screen.getByText("needs vetting")).toBeInTheDocument();
    expect(screen.getByText("Imported file")).toBeInTheDocument();
  });

  it("shows no vetting badge on a skill written here", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.queryByText("needs vetting")).not.toBeInTheDocument();
  });

  it("toggling does not also fire the card's navigation", () => {
    // The whole card is a click target; without stopPropagation the toggle
    // would flip the skill AND navigate away from the page.
    const onClick = vi.fn();
    const onToggle = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onClick={onClick} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("clicking the card itself selects it", () => {
    const onClick = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onClick={onClick} />);
    fireEvent.click(screen.getByText("secret-leakage-gate"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders em dashes rather than 0% when the rollups are null", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("— agents · — pull · — accept")).toBeInTheDocument();
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
  });

  it("renders the rollups when they were measured", () => {
    renderWithIntl(
      <SkillCard skill={{ ...SKILL, agent_count: 3, pull_rate: 0.42, accept_rate: 0.68 }} />,
    );
    expect(screen.getByText("3 agents · 42% pull · 68% accept")).toBeInTheDocument();
  });

  it("marks the source with an icon as well as a word", () => {
    const { container } = renderWithIntl(<SkillCard skill={SKILL} />);
    const source = screen.getByText("Manual");
    expect(source).toBeInTheDocument();
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(1);
  });
});
