import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../messages/en/runs.json";

const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "s", skills: null, memory: null, specs: null, user: "u" },
  tool_calls: [],
  raw_output: "{}",
  memory_pulled: [],
  specs_read: [],
  specs_skipped: [],
  log: [],
};

const live = { running: false };
vi.mock("@/lib/hooks/reviews", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/hooks/reviews")>()),
  useRunEvents: () => ({ events: [], running: live.running }),
}));
const get = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (...a: unknown[]) => get(...a) },
}));

import RunTraceDrawer from "./RunTraceDrawer";

const NOW = new Date("2026-10-15T12:00:00Z").getTime();

function mount(props: { running?: boolean; endedAt?: string | null }) {
  const qc = new QueryClient();
  let current = props;
  const tree = () => (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
        <div data-theme="dark">
          <RunTraceDrawer runId="r1" agentName="Security" onClose={() => {}} {...current} />
        </div>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  return {
    ...view,
    rerenderSame: () => view.rerender(tree()),
    setProps: (next: typeof props) => {
      current = next;
      view.rerender(tree());
    },
  };
}

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.setSystemTime(NOW);
  live.running = false;
  get.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("trace pending (spec 013)", () => {
  it("shows 'pending' on a 404 right after the run ends, then the trace once written (AC-54)", async () => {
    get.mockRejectedValueOnce(new Error("404")).mockResolvedValue(TRACE);
    mount({ endedAt: new Date(NOW - 1000).toISOString() });
    await flush();
    expect(screen.getByText(/Trace is written when the run completes/)).toBeInTheDocument();
    await advance(2100);
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
  });

  it("falls back to 'No trace available yet.' 30 s after the end (AC-54a)", async () => {
    get.mockRejectedValue(new Error("404"));
    mount({ endedAt: new Date(NOW).toISOString() });
    await flush();
    expect(screen.queryByText("No trace available yet.")).toBeNull();
    await advance(30_500);
    expect(screen.getByText("No trace available yet.")).toBeInTheDocument();
  });

  it("an old endedAt shows no-trace at once", async () => {
    get.mockRejectedValue(new Error("404"));
    mount({ endedAt: new Date(NOW - 120_000).toISOString() });
    await flush();
    expect(screen.getByText("No trace available yet.")).toBeInTheDocument();
  });

  it("a running run opens on the Live log and does not request the trace (AC-53)", async () => {
    live.running = true;
    mount({ running: true });
    await flush();
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it("shows tokens and the grounding badge once loaded (AC-57)", async () => {
    get.mockResolvedValue(TRACE);
    mount({ endedAt: new Date(NOW - 1000).toISOString() });
    await flush();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("12k→1.5k")).toBeInTheDocument();
  });

  it("a run that ends > 30 s after mount still shows 'pending' and only then fetches the trace (AC-53/54)", async () => {
    get.mockRejectedValueOnce(new Error("404")).mockResolvedValue(TRACE);
    live.running = false; // useRunEvents starts idle, before the stream connects
    const view = mount({ running: true });
    await flush();
    expect(get).not.toHaveBeenCalled();

    live.running = true;
    view.rerenderSame();
    await advance(40_000);
    expect(get).not.toHaveBeenCalled();

    live.running = false; // SSE closes, > 30 s after mount ...
    view.setProps({ running: false }); // ... and the parent reports the run ended
    await flush();
    fireEvent.click(screen.getByText("trace")); // user-event is not a client dependency
    expect(screen.getByText(/Trace is written when the run completes/)).toBeInTheDocument();
    expect(screen.queryByText("No trace available yet.")).toBeNull();
    expect(get).toHaveBeenCalled();

    await advance(2100);
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
  });

  it("a timeout belongs to the deadline it fired for: a later end time re-opens the wait (PR2-H1)", async () => {
    get.mockRejectedValue(new Error("404"));
    const view = mount({ running: false, endedAt: null }); // no end time yet: counted from first sight
    await flush();
    await advance(31_000);
    expect(screen.getByText("No trace available yet.")).toBeInTheDocument();

    // the real end time arrives later than the first-sight clock -> a new, later deadline
    view.setProps({ running: false, endedAt: new Date(NOW + 31_000).toISOString() });
    await flush();
    expect(screen.queryByText("No trace available yet.")).toBeNull();
    expect(screen.getByText(/Trace is written when the run completes/)).toBeInTheDocument();

    await advance(30_500);
    expect(screen.getByText("No trace available yet.")).toBeInTheDocument();
  });

  it("a stream that closes while the parent still says running stays running and fetches nothing (PR3-C2)", async () => {
    live.running = false;
    const view = mount({ running: true });
    await flush();
    live.running = true;
    view.rerenderSame();
    await flush();
    live.running = false; // transient SSE close, run not ended
    view.rerenderSame();
    await advance(40_000);
    expect(screen.getByText(/running/)).toBeInTheDocument();
    expect(screen.queryByText(/completed/)).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});
