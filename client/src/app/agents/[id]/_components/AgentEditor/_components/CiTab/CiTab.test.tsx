import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, CiInstallationView } from "@devdigest/shared";
import ciMessages from "../../../../../../../../messages/en/ci.json";
import agentMessages from "../../../../../../../../messages/en/agents.json";
import commonMessages from "../../../../../../../../messages/en/common.json";
import { ToastProvider } from "../../../../../../../lib/toast";
import { activeCount, gateDriftOf } from "./helpers";

const useCiInstallations = vi.fn();
const useCiRefresh = vi.fn();
const removeMutate = vi.fn();
const updateMutate = vi.fn();
const refetch = vi.fn();

vi.mock("../../../../../../../lib/hooks/ci", async (importActual) => ({
  ...(await importActual<typeof import("../../../../../../../lib/hooks/ci")>()),
  useCiInstallations: (id: string) => useCiInstallations(id),
  useCiRefresh: (scope: unknown, enabled?: boolean) => useCiRefresh(scope, enabled),
  useRemoveCiInstallation: () => ({ mutate: removeMutate, isPending: false }),
}));
vi.mock("../../../../../../../lib/hooks/agents", async (importActual) => ({
  ...(await importActual<typeof import("../../../../../../../lib/hooks/agents")>()),
  useUpdateAgent: () => ({ mutate: updateMutate, isPending: false }),
}));

// The wizard is tested on its own; here it only reports what it was opened with.
vi.mock("../ExportWizard", () => ({
  ExportWizard: ({ request }: { request: { installation: { id: string } | null } }) => (
    <div data-testid="wizard">{request.installation ? request.installation.id : "fresh"}</div>
  ),
}));

import { CiTab } from "./CiTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openrouter",
  model: "x",
  system_prompt: "x",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 3,
};

const inst = (over: Partial<CiInstallationView>): CiInstallationView => ({
  id: "i1",
  agent_id: "ag1",
  repo: "acme/payments-api",
  repo_id: "r1",
  target_type: "gha",
  mode: "pr",
  exported_agent_version: 3,
  exported_ci_fail_on: "critical",
  workflow_version: 1,
  runner_version: "0.1.0",
  triggers: ["opened"],
  post_as: "github_review",
  pr_number: 7,
  pr_url: "https://github.com/acme/payments-api/pull/7",
  installed_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
  pr_state: "merged",
  state: "active",
  out_of_date: false,
  gate_drift: false,
  latest_run: { status: "passed", ran_at: new Date(Date.now() - 4 * 60_000).toISOString() },
  ...over,
});

const load = (data: CiInstallationView[] | undefined, over: Record<string, unknown> = {}) =>
  useCiInstallations.mockReturnValue({ data, isLoading: false, isError: false, refetch, ...over });

function renderTab() {
  render(
    <NextIntlClientProvider locale="en" messages={{ ci: ciMessages, agents: agentMessages, common: commonMessages }}>
      <ToastProvider>
        <CiTab agent={AGENT} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  [useCiInstallations, useCiRefresh, removeMutate, updateMutate, refetch].forEach((f) => f.mockReset());
});

describe("helpers", () => {
  it("counts only active installations and reads gate drift", () => {
    expect(activeCount([inst({}), inst({ state: "pending_merge" }), inst({ state: "inactive" })])).toBe(1);
    expect(gateDriftOf({ gate_drift: true, exported_ci_fail_on: "warning" }, "any")).toEqual({
      exported: "warning",
      current: "any",
    });
    expect(gateDriftOf({ gate_drift: false, exported_ci_fail_on: "warning" }, "any")).toBeNull();
  });
});

describe("CiTab", () => {
  it("lists installations with state badges and counts only active ones", () => {
    load([
      inst({}),
      inst({ id: "i2", repo: "acme/billing-worker", state: "pending_merge", pr_state: "open", latest_run: null, out_of_date: true }),
      inst({ id: "i3", repo: "acme/old", state: "inactive", pr_state: "unknown", pr_url: null }),
    ]);
    renderTab();
    expect(useCiRefresh).toHaveBeenCalledWith({ agent_id: "ag1" }, undefined);
    expect(screen.getByText("Active in 1 repo")).toBeInTheDocument();
    expect(screen.getByText("acme/payments-api")).toBeInTheDocument();
    expect(screen.getAllByText("succeeded")).toHaveLength(2);
    expect(screen.getByText(ciMessages.ciTab.noRuns)).toBeInTheDocument();
    expect(screen.getAllByText(ciMessages.ciTab.state.pending_merge).length).toBeGreaterThan(0);
    expect(screen.getAllByText(ciMessages.ciTab.state.inactive).length).toBeGreaterThan(0);
    expect(screen.getAllByText(ciMessages.ciTab.outOfDate).length).toBeGreaterThan(0);
    expect(screen.getByText(ciMessages.ciTab.prState.unknown)).toBeInTheDocument();
    const links = screen.getAllByText(ciMessages.ciTab.viewPr);
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "https://github.com/acme/payments-api/pull/7");
  });

  it("shows gate drift and saves a new fail-on through the agent update", () => {
    load([inst({ gate_drift: true, exported_ci_fail_on: "never" })]);
    renderTab();
    expect(screen.getByText(/still uses the old gate/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "any" } });
    expect(updateMutate).toHaveBeenCalledWith({ id: "ag1", patch: { ci_fail_on: "any" } });
  });

  it("opens the wizard: Add to CI fresh, Update with one installation directly, a picker with several", () => {
    load([inst({})]);
    renderTab();
    fireEvent.click(screen.getByText(ciMessages.ciTab.addToCi));
    expect(screen.getByTestId("wizard")).toHaveTextContent("fresh");
    cleanup();

    load([inst({})]);
    renderTab();
    fireEvent.click(screen.getByText(ciMessages.ciTab.updateConfig));
    expect(screen.getByTestId("wizard")).toHaveTextContent("i1");
    cleanup();

    load([inst({}), inst({ id: "i2", repo: "acme/billing-worker" })]);
    renderTab();
    fireEvent.click(screen.getByText(ciMessages.ciTab.updateConfig));
    expect(screen.queryByTestId("wizard")).toBeNull();
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByText("acme/billing-worker"));
    expect(screen.getByTestId("wizard")).toHaveTextContent("i2");
  });

  it("confirms a removal with the by-hand warning, then deletes only after Confirm", () => {
    load([inst({})]);
    renderTab();
    fireEvent.click(screen.getByLabelText(ciMessages.ciTab.remove.action));
    expect(removeMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/must be removed by hand/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(ciMessages.ciTab.remove.confirm));
    expect(removeMutate).toHaveBeenCalledWith("i1", expect.any(Object));
  });

  it("shows the empty state and a retry on error", () => {
    load([]);
    renderTab();
    expect(screen.getByText(ciMessages.ciTab.emptyTitle)).toBeInTheDocument();
    expect(screen.getByText(ciMessages.ciTab.updateConfig).closest("button")).toBeDisabled();
    cleanup();

    load(undefined, { isError: true });
    renderTab();
    fireEvent.click(screen.getByText(commonMessages.actions.retry));
    expect(refetch).toHaveBeenCalled();
  });
});
