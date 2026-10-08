import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  specs_skipped: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

vi.mock("../../../../../../../lib/hooks/trace", async (importActual) => ({
  ...(await importActual<typeof import("../../../../../../../lib/hooks/trace")>()),
  useRunTrace: () => ({ data: TRACE, isLoading: false }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", async (importActual) => ({
  ...(await importActual<typeof import("../../../../../../../lib/hooks/reviews")>()),
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";
import { TraceBody } from "./_components/TraceBody";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });
});

describe("Run trace — COST tile (spec 001)", () => {
  it("a trace written before cost existed still parses and reads COST —", () => {
    // TRACE above carries no cost keys at all — exactly a pre-spec-001 document.
    renderWithIntl(<TraceBody trace={TRACE} findings={[]} />);
    expect(screen.getByText("COST")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a reported price bare and an estimated one with ~", () => {
    renderWithIntl(
      <TraceBody trace={{ ...TRACE, stats: { ...TRACE.stats, cost_usd: 0.06, cost_source: "api" } }} findings={[]} />,
    );
    expect(screen.getByText("$0.06")).toBeInTheDocument();
    cleanup();
    renderWithIntl(
      <TraceBody
        trace={{ ...TRACE, stats: { ...TRACE.stats, cost_usd: 0.06, cost_source: "estimate" } }}
        findings={[]}
      />,
    );
    expect(screen.getByText("~$0.06")).toBeInTheDocument();
  });
});

describe("Run trace — project context (spec 008)", () => {
  it("lists a skipped document with its reason and labels the specs block", () => {
    renderWithIntl(
      <TraceBody
        trace={{
          ...TRACE,
          specs_read: ["specs/a.md"],
          specs_skipped: [{ path: "docs/big.md", reason: "too_large" }],
          prompt_assembly: { ...TRACE.prompt_assembly, specs: "<untrusted>x</untrusted>", specs_tokens: 12 },
        }}
        findings={[]}
      />,
    );
    expect(screen.getByText("docs/big.md — too large")).toBeInTheDocument();
    // Prompt assembly starts collapsed.
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("Project context — attached specs (untrusted)")).toBeInTheDocument();
  });

  it("a trace without specs_skipped renders no skipped line", () => {
    const { specs_skipped: _omit, ...legacy } = TRACE;
    renderWithIntl(<TraceBody trace={legacy} findings={[]} />);
    expect(screen.queryByText(/ — /)).not.toBeInTheDocument();
  });

  it("renders every read and skipped document without a React key warning", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    renderWithIntl(
      <TraceBody
        trace={{
          ...TRACE,
          specs_read: ["specs/a.md", "specs/b.md"],
          specs_skipped: [
            { path: "docs/big.md", reason: "too_large" },
            { path: "docs/huge.md", reason: "too_large" },
          ],
        }}
        findings={[]}
      />,
    );
    expect(screen.getByText("specs/a.md")).toBeInTheDocument();
    expect(screen.getByText("specs/b.md")).toBeInTheDocument();
    expect(screen.getByText("docs/big.md — too large")).toBeInTheDocument();
    expect(screen.getByText("docs/huge.md — too large")).toBeInTheDocument();
    const keyWarnings = errors.mock.calls.filter((c) => String(c[0]).includes("unique \"key\""));
    expect(keyWarnings).toHaveLength(0);
    errors.mockRestore();
  });
});
