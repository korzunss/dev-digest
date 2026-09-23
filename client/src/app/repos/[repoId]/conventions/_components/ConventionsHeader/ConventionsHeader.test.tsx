import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionScan } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionsHeader } from "./ConventionsHeader";
import { droppedCount, scanAge } from "./helpers";

afterEach(cleanup);

const NOW = Date.parse("2026-09-22T12:00:00.000Z");

const SCAN: ConventionScan = {
  id: "scan-1",
  repo_id: "repo-1",
  commit_sha: "a1b2c3d4e5f6",
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  sample_paths: ["package.json", "tsconfig.json", "src/api/users.ts"],
  candidates_raw: 9,
  candidates_kept: 7,
  dropped: { snippet_absent: 1, file_not_sampled: 1 },
  tokens_in: 8100,
  tokens_out: 640,
  cost_usd: 0.0021,
  status: "done",
  error: null,
  created_at: "2026-09-22T09:55:00.000Z",
  finished_at: "2026-09-22T10:00:00.000Z",
};

function renderHeader(props: Partial<React.ComponentProps<typeof ConventionsHeader>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionsHeader repoName="acme/payments-api" scan={SCAN} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("droppedCount", () => {
  it("sums the gate's per-reason tally", () => {
    expect(droppedCount(SCAN)).toBe(2);
  });

  it("falls back to raw minus kept when no tally was recorded", () => {
    // A scan row written before the tally column existed still knows how many
    // candidates went in and how many came out.
    expect(droppedCount({ ...SCAN, dropped: null })).toBe(2);
  });

  it("never reports a negative drop", () => {
    // A re-scan refreshes an existing row, so `kept` can outrun `raw`; "-3
    // candidates were dropped" is worse than saying nothing.
    expect(droppedCount({ ...SCAN, dropped: null, candidates_raw: 2, candidates_kept: 5 })).toBe(0);
    expect(droppedCount(null)).toBe(0);
  });
});

describe("scanAge", () => {
  it("reads as a relative time", () => {
    expect(scanAge("2026-09-22T10:00:00.000Z", "en", NOW)).toBe("2 hours ago");
    expect(scanAge("2026-09-22T11:58:00.000Z", "en", NOW)).toBe("2 minutes ago");
    expect(scanAge("2026-09-19T12:00:00.000Z", "en", NOW)).toBe("3 days ago");
  });

  it("has nothing to say about a missing or unparseable timestamp", () => {
    expect(scanAge(null)).toBeNull();
    expect(scanAge(undefined)).toBeNull();
    expect(scanAge("not a date")).toBeNull();
  });
});

describe("ConventionsHeader", () => {
  it("names the repo that was scanned", () => {
    renderHeader();
    expect(screen.getByText("acme/payments-api")).toBeInTheDocument();
    expect(screen.getByText(/Conventions in/)).toBeInTheDocument();
  });

  it("says how much of the repo the model was shown, and when", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      renderHeader();
      expect(screen.getByText("3 files sampled")).toBeInTheDocument();
      expect(screen.getByText("last scan 2 hours ago")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // Two buttons, always both present. A single control that renames itself
  // hides half of what the page can do until you have already done it once.
  it("offers Run Scan and keeps Re-scan visible but inert before any scan", () => {
    renderHeader({ scan: null });
    const run = screen.getByText(messages.page.runScan).closest("button");
    const rescan = screen.getByText(messages.page.rescan).closest("button");
    expect(run).toBeEnabled();
    expect(rescan).toBeDisabled();
    // Nothing has been sampled yet, so the meta line explains the feature.
    expect(screen.getByText(messages.page.subtitle)).toBeInTheDocument();
  });

  it("swaps which of the two is live once a scan exists", () => {
    renderHeader({});
    expect(screen.getByText(messages.page.runScan).closest("button")).toBeDisabled();
    expect(screen.getByText(messages.page.rescan).closest("button")).toBeEnabled();
  });

  it("runs the extraction again from the header", () => {
    const onRescan = vi.fn();
    renderHeader({ onRescan });
    fireEvent.click(screen.getByText("Re-scan"));
    expect(onRescan).toHaveBeenCalledTimes(1);
  });

  it("shows the scanning state and refuses a second run while one is in flight", () => {
    const onRescan = vi.fn();
    renderHeader({ onRescan, scanning: true });
    fireEvent.click(screen.getByText("Scanning…"));
    expect(onRescan).not.toHaveBeenCalled();
  });

  it("explains a short list with the evidence gate's tally", () => {
    renderHeader();
    expect(
      screen.getByText(
        "2 candidates were dropped — the cited code was not in the sampled files.",
      ),
    ).toBeInTheDocument();
  });

  it("says nothing about drops when every candidate survived", () => {
    renderHeader({ scan: { ...SCAN, dropped: {}, candidates_raw: 7 } });
    expect(screen.queryByText(/were dropped/)).not.toBeInTheDocument();
  });
});
