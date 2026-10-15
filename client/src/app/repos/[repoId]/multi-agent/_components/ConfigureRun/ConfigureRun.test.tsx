/* ConfigureRun — AC-10…AC-15 plus the no-agents state. Hooks are mocked at
   their module edge; the router and the `?pr=` address are stubbed. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import runs from "../../../../../../../messages/en/runs.json";

const push = vi.fn();
const replace = vi.fn();
let query = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(query),
}));

let pulls: unknown[] = [];
vi.mock("@/lib/hooks", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/hooks")>()),
  usePulls: () => ({ data: pulls, isLoading: false, isError: false }),
}));
let agents: unknown[] = [];
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: agents, isLoading: false, isError: false }),
}));
const mutate = vi.fn();
let startState: { isError: boolean; error?: unknown } = { isError: false };
let recent: unknown[] | undefined = [];
let latest: unknown = null;
vi.mock("@/lib/hooks/multi-agent", () => ({
  useRecentMultiAgentRuns: () => ({ data: recent }),
  useLatestMultiAgentRun: () => ({ data: { run: latest } }),
  useAgentEstimates: () => ({
    data: [
      { agent_id: "a1", duration_ms: 40_000, cost_usd: 0.03, sample_size: 2, last_verdict: "ok" },
      { agent_id: "a2", duration_ms: 60_000, cost_usd: 0.05, sample_size: 2, last_verdict: null },
    ],
  }),
  useStartMultiAgentRun: () => ({ mutate, isPending: false, ...startState }),
}));

import { ConfigureRun } from "./ConfigureRun";

const PULLS = [{ id: "pr-1", number: 7, title: "Fix auth" }];
const AGENTS = [
  { id: "a1", name: "Security", enabled: true },
  { id: "a2", name: "Style", enabled: false },
];

function renderScreen() {
  render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <ConfigureRun repoId="r1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  mutate.mockReset();
  startState = { isError: false };
  query = "";
  pulls = PULLS;
  agents = AGENTS;
  recent = [];
  latest = null;
});
afterEach(cleanup);

describe("ConfigureRun", () => {
  it("without a PR shows 'Pick a pull request first' and cannot run; choosing a PR writes ?pr= (AC-10, AC-11)", () => {
    renderScreen();
    expect(screen.getByText("Pick a pull request first")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run multi-agent review/ })).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "7" } });
    expect(replace).toHaveBeenCalledWith("/repos/r1/multi-agent?pr=7");
  });

  it("preselects the PR from the address, selects all, shows the aggregate and starts the run (AC-10, 13, 14, 15)", () => {
    query = "pr=7";
    mutate.mockImplementation((_v, opts) => opts.onSuccess({ id: "run-9" }));
    renderScreen();
    expect(screen.getByRole("combobox")).toHaveValue("7");
    expect(screen.getByRole("button", { name: "Run multi-agent review (1)" })).toBeEnabled();
    expect(screen.getByText(/^≈ 40s · .* · parallel fan-out$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText(/^≈ 60s · .* · parallel fan-out$/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (2)" }));
    expect(mutate).toHaveBeenCalledWith({ prId: "pr-1", agentIds: ["a1", "a2"] }, expect.any(Object));
    expect(push).toHaveBeenCalledWith("/repos/r1/multi-agent/run-9");
  });

  it("shows the mockup copy: title, subtitle, numbered steps and the empty-state body (DG1-DG3)", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: "Run a Multi-Agent Review" })).toBeInTheDocument();
    expect(screen.getByText(/they run in parallel and you compare their findings side by side/)).toBeInTheDocument();
    expect(screen.queryByText(/selected agents/)).toBeNull();
    expect(screen.getByText("Pull request")).toBeInTheDocument();
    expect(screen.getByText("Agents to run")).toBeInTheDocument();
    expect(screen.getByText("Choose which PR to review above, then select the agents to run on it.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select all" })).toBeNull();
  });

  it("disables the run button when nothing is ticked", () => {
    query = "pr=7";
    renderScreen();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    expect(screen.getByRole("button", { name: "Run multi-agent review (0)" })).toBeDisabled();
  });

  it("shows the recent runs below the run button and the latest run beside step 1 (AC-15b, 15g)", () => {
    query = "pr=7";
    const run = {
      id: "m9", pr_id: "pr-1", pr_number: 7, pr_title: "Fix auth", ran_at: "2026-06-11T18:44:34.000Z",
      status: "done", agent_count: 1, agent_names: ["Security"], total_duration_ms: 1000,
      total_cost_usd: 0.03, total_cost_partial: false,
    };
    recent = [run];
    latest = run;
    renderScreen();
    const button = screen.getByRole("button", { name: /Run multi-agent review/ });
    const recentLink = screen.getByRole("link", { name: /Fix auth/ });
    expect(button.compareDocumentPosition(recentLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: /Latest run for #7/ })).toHaveAttribute("href", "/repos/r1/multi-agent/m9");
  });

  it("shows a translated fallback, not String(error), when the start fails without an ApiError (PR-C1)", () => {
    query = "pr=7";
    startState = { isError: true, error: new TypeError("Failed to fetch") };
    renderScreen();
    expect(screen.getByRole("alert")).toHaveTextContent("Could not start the multi-agent review. Try again.");
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });

  it("with no agents offers a link to Agents", () => {
    query = "pr=7";
    agents = [];
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Go to Agents" }));
    expect(push).toHaveBeenCalledWith("/agents");
  });
});
