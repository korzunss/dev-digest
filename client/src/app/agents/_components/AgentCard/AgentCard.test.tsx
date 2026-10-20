import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";
import perfMessages from "../../../../../messages/en/agentPerformance.json";
import { row, split, zeroRow } from "../../../agent-performance/_components/AgentPerfTable/fixtures";
import { AgentCard } from "./AgentCard";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages, agentPerformance: perfMessages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("AgentCard (smoke)", () => {
  it("renders the agent name, model chip and skill count", () => {
    renderWithIntl(<AgentCard ag={AGENT} skillCount={3} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("3 skills")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });
});

describe("AgentCard summary line (AC-30, AC-32)", () => {
  it("shows runs, accept and avg cost over 30 days, with a ~ on an estimated average", () => {
    renderWithIntl(<AgentCard ag={AGENT} summary={{ state: "row", row: row("Security Reviewer", { runs: 142, accept_rate: 0.78, avg_cost_usd: 0.04 }) }} />);
    expect(document.body).toHaveTextContent("142 runs · 78% accept · $0.04 avg");
    cleanup();
    renderWithIntl(
      <AgentCard
        ag={AGENT}
        summary={{ state: "row", row: row("Security Reviewer", { runs: 1, accept_rate: null, accepted: 0, dismissed: 0, avg_cost_usd: 0.04, cost_split: split(0, 0.04) }) }}
      />,
    );
    // DG2: no trailing "accept" when there are no decisions.
    expect(document.body).toHaveTextContent("1 run · no decisions yet · ~$0.04 avg");
    expect(document.body).not.toHaveTextContent(/no decisions yet accept/);
  });

  it("colours the accept part by rate on the ring thresholds, neutral for a small sample (DG4)", () => {
    const accept = (over: Parameters<typeof row>[1]) => {
      renderWithIntl(<AgentCard ag={AGENT} summary={{ state: "row", row: row("Security Reviewer", { runs: 20, ...over }) }} />);
      const el = screen.getByText(/% accept/);
      cleanup();
      return el.style.color;
    };
    expect(accept({ accepted: 80, dismissed: 20, accept_rate: 0.8 })).toBe("var(--ok)");
    expect(accept({ accepted: 6, dismissed: 6, accept_rate: 0.5 })).toBe("var(--warn)");
    expect(accept({ accepted: 3, dismissed: 9, accept_rate: 0.25 })).toBe("var(--crit)");
    expect(accept({ accepted: 3, dismissed: 0, accept_rate: 1 })).toBe("");
  });

  it("marks 1-9 decisions as a small sample with the denominator, and 10+ plainly (AC-30, M-9)", () => {
    renderWithIntl(<AgentCard ag={AGENT} summary={{ state: "row", row: row("Security Reviewer", { runs: 6, accepted: 3, dismissed: 1, accept_rate: 0.75 }) }} />);
    expect(document.body).toHaveTextContent("6 runs · 75% accept (n = 4, small sample) ·");
    cleanup();
    renderWithIntl(<AgentCard ag={AGENT} summary={{ state: "row", row: row("Security Reviewer", { runs: 20, accepted: 8, dismissed: 2, accept_rate: 0.8 }) }} />);
    expect(document.body).toHaveTextContent("80% accept ·");
    expect(document.body).not.toHaveTextContent(/small sample/);
  });

  it("shows 'No runs in 30 days' for a zero-run agent, a placeholder while loading, and nothing on error — never zeros", () => {
    renderWithIntl(<AgentCard ag={AGENT} summary={{ state: "row", row: zeroRow("Security Reviewer") }} />);
    expect(screen.getByText("No runs in 30 days")).toBeInTheDocument();
    cleanup();
    const { container } = renderWithIntl(<AgentCard ag={AGENT} summary={{ state: "loading" }} />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByText(/runs/)).not.toBeInTheDocument();
    cleanup();
    renderWithIntl(<AgentCard ag={AGENT} summary={{ state: "error" }} onToggle={() => {}} />);
    expect(screen.queryByText(/ runs| avg|accept/)).not.toBeInTheDocument();
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
  });
});
