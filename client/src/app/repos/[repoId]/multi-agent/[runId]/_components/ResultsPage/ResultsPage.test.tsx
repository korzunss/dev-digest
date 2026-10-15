/* ResultsPage — AC-30, 32, 35, 52, 55, 56. Hooks mocked at their module edge. */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import runs from "../../../../../../../../messages/en/runs.json";

const push = vi.fn();
const replace = vi.fn();
let query = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(query),
}));

let state: Record<string, unknown> = {};
vi.mock("@/lib/hooks/multi-agent", () => ({ useMultiAgentRun: () => state }));
let drawerMounts = 0;
vi.mock("@/components/run-trace-drawer", () => ({
  default: (p: { runId: string; running: boolean; endedAt: string | null; onClose: () => void }) => {
    React.useEffect(() => {
      drawerMounts += 1;
    }, []);
    return (
      <div data-testid="drawer" data-running={String(p.running)} data-ended={p.endedAt ?? ""}>
        drawer {p.runId}
        <button onClick={p.onClose}>close</button>
      </div>
    );
  },
}));

import { ApiError } from "@/lib/api";
import { ResultsPage } from "./ResultsPage";

const col = (run_id: string, status: string, over: Record<string, unknown> = {}) => ({
  run_id,
  agent_name: `Agent ${run_id}`,
  agent_deleted: false,
  status,
  error: status === "failed" ? "boom" : null,
  score: null,
  duration_ms: null,
  cost_usd: null,
  cost_source: null,
  finished_at: status === "running" ? null : "2026-10-15T10:00:00Z",
  findings: [],
  ...over,
});
const RUN = {
  id: "m1",
  pr_number: 7,
  pr_title: "Fix auth",
  agent_count: 2,
  total_duration_ms: 5000,
  total_cost_usd: 0.1,
  total_cost_partial: false,
  columns: [col("r1", "failed"), col("r2", "running")],
  conflicts: [],
};

function renderIt() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs }}>
      <ResultsPage repoId="repo1" runId="m1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  query = "";
  drawerMounts = 0;
  state = { data: RUN, isLoading: false, isError: false };
});
afterEach(cleanup);

describe("ResultsPage", () => {
  it("shows Columns by default with failure reasons and Configure run when every column failed", () => {
    state = { data: { ...RUN, columns: [col("r1", "failed"), col("r2", "failed")] }, isLoading: false, isError: false };
    renderIt();
    expect(screen.getAllByText("boom")).toHaveLength(2);
    expect(screen.queryByTestId("drawer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Configure run" }));
    expect(push).toHaveBeenCalledWith("/repos/repo1/multi-agent?pr=7");
  });

  it("View trace puts the run id in the address; a ?trace= of a column opens the drawer live", () => {
    renderIt();
    fireEvent.click(screen.getAllByText("View trace")[1]!);
    expect(replace).toHaveBeenCalledWith("/repos/repo1/multi-agent/m1?trace=r2");
    cleanup();
    query = "trace=r2";
    renderIt();
    expect(screen.getByTestId("drawer").getAttribute("data-running")).toBe("true");
    fireEvent.click(screen.getByText("close"));
    expect(replace).toHaveBeenLastCalledWith("/repos/repo1/multi-agent/m1");
  });

  it("remounts the drawer when ?trace= moves to another run, so per-run state resets (PR-H1)", () => {
    query = "trace=r1";
    const { rerender } = renderIt();
    expect(drawerMounts).toBe(1);
    query = "trace=r2";
    rerender(
      <NextIntlClientProvider locale="en" messages={{ runs }}>
        <ResultsPage repoId="repo1" runId="m1" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("drawer")).toHaveTextContent("drawer r2");
    expect(drawerMounts).toBe(2);
  });

  it("ignores a ?trace= of a run that is not one of its columns", () => {
    query = "trace=foreign";
    renderIt();
    expect(screen.queryByTestId("drawer")).toBeNull();
  });

  it("shows not-found for a 404 and an error state with retry otherwise", () => {
    state = { data: undefined, isLoading: false, isError: true, error: new ApiError("nope", 404) };
    renderIt();
    expect(screen.getByText("This multi-agent run was not found.")).toBeTruthy();
    cleanup();
    state = { data: undefined, isLoading: false, isError: true, error: new Error("x"), refetch: vi.fn() };
    renderIt();
    expect(screen.getByRole("alert")).toBeTruthy();
  });
});
