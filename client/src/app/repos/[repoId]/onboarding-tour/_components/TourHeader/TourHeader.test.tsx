/* TourHeader — title/meta/actions/banners (spec 009 AC-13, 18, 19, 22, 23, 26, 27, 32, 36).
   Clipboard and toast are the outside world; the clock is pinned for the relative age. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingTourView } from "@devdigest/shared";
import onboarding from "../../../../../../../messages/en/onboarding.json";

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), toast: vi.fn() };
vi.mock("@/lib/toast", () => ({ useToast: () => toast }));

import { TourHeader } from "./TourHeader";

const emptyTour: OnboardingTourView["tour"] = {
  source: "llm",
  built_sha: "abc123",
  generated_at: "2026-10-05T10:00:00Z",
  index_files: 42,
  model: null,
  architecture: { availability: { available: true, cause: null, reason: null }, body: "", diagram: null, stack: [], structure: [] },
  critical_paths: { availability: { available: true, cause: null, reason: null }, rows: [] },
  run_locally: { availability: { available: true, cause: null, reason: null }, commands: [] },
  reading_path: { availability: { available: true, cause: null, reason: null }, steps: [] },
  first_tasks: { availability: { available: true, cause: null, reason: null }, tasks: [] },
};

function makeView(over: Partial<OnboardingTourView> = {}): OnboardingTourView {
  return {
    repo_id: "r1",
    clone: { state: "ready", error: null },
    index: {
      status: "full",
      reason: null,
      files_indexed: 42,
      source_files_total: 42,
      coverage_partial: false,
      partial_cause: null,
      last_indexed_sha: "abc123",
    },
    model: { provider: "anthropic", model: "claude-test-1" },
    generating: false,
    stale: false,
    last_failure: null,
    stored: true,
    tour: emptyTour,
    ...over,
  };
}

const onGenerate = vi.fn();
function renderHeader(view: OnboardingTourView, pending = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <TourHeader repoName="acme/api" view={view} pending={pending} onGenerate={onGenerate} />
    </NextIntlClientProvider>,
  );
}

const writeText = vi.fn();
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  onGenerate.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  // @ts-expect-error restore jsdom's lack of clipboard
  delete navigator.clipboard;
});

describe("TourHeader", () => {
  // AC-36: the provider and model the call will use are shown beside the action
  it("AC-36: shows 'Will use provider · model' next to Generate", () => {
    renderHeader(makeView({ stored: false }));
    expect(screen.getByText("Will use anthropic · claude-test-1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  // AC-36: Regenerate keeps showing the model
  it("AC-36: a stored tour offers Regenerate with the model shown", () => {
    renderHeader(makeView({ stored: true, model: { provider: "openai", model: "gpt-test" } }));
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
    expect(screen.getByText("Will use openai · gpt-test")).toBeInTheDocument();
  });

  // AC-13: while generating (server flag) the action is disabled and says so
  it("AC-13: shows Generating… disabled while the server reports generating", () => {
    renderHeader(makeView({ generating: true }));
    const btn = screen.getByRole("button", { name: /Generating…/ });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  // AC-13: the POST in flight (before the server flag flips) also blocks a second click
  it("AC-13: shows Generating… disabled while the request is pending", () => {
    renderHeader(makeView({ generating: false }), true);
    const btn = screen.getByRole("button", { name: /Generating…/ });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onGenerate).not.toHaveBeenCalled();
  });

  // AC-26: stored tour subtitle with count and relative time
  it("AC-26: shows 'Generated from index of N files · last refreshed <relative>'", () => {
    renderHeader(makeView());
    expect(screen.getByText("Generated from index of 42 files · last refreshed 2 hours ago")).toBeInTheDocument();
    expect(screen.queryByText(/source files · partial/)).not.toBeInTheDocument();
  });

  // AC-26: no stored tour ⇒ no "Generated from…" claim
  it("AC-26: shows no subtitle when no tour is stored", () => {
    renderHeader(makeView({ stored: false }));
    expect(screen.queryByText(/Generated from index/)).not.toBeInTheDocument();
  });

  // AC-23: partial index states coverage and, for a parse/graph cause, the reason beside it
  it("AC-23: shows 'indexed N of M source files · partial' with the parse-error cause instead of the subtitle", () => {
    renderHeader(
      makeView({
        index: {
          status: "partial",
          reason: null,
          files_indexed: 120,
          source_files_total: 480,
          coverage_partial: true,
          partial_cause: "parse_errors",
          last_indexed_sha: "abc123",
        },
      }),
    );
    expect(screen.getByText(/indexed 120 of 480 source files · partial/)).toHaveTextContent(
      "indexed 120 of 480 source files · partial (some files failed to parse)",
    );
    expect(screen.queryByText(/Generated from index/)).not.toBeInTheDocument();
  });

  // AC-23: when the cap is the cause the label names it too (reason is "next to the coverage")
  it("AC-23: names the file-cap cause beside the coverage", () => {
    renderHeader(
      makeView({
        index: {
          status: "partial",
          reason: null,
          files_indexed: 5000,
          source_files_total: 12450,
          coverage_partial: true,
          partial_cause: "file_cap",
          last_indexed_sha: "abc123",
        },
      }),
    );
    expect(screen.getByText(/indexed 5000 of 12450 source files · partial/)).toHaveTextContent("the file cap was reached");
  });

  // AC-22: a non-full index is labelled with its status and mapped reason
  it("AC-22: labels a degraded index with its status and reason; a full index has no label", () => {
    const first = renderHeader(
      makeView({
        index: {
          status: "degraded",
          reason: "no_clone",
          files_indexed: 0,
          source_files_total: null,
          coverage_partial: false,
          partial_cause: null,
          last_indexed_sha: "",
        },
      }),
    );
    expect(screen.getByText("Index degraded · There is no local clone to index")).toBeInTheDocument();
    first.unmount();

    renderHeader(makeView());
    expect(screen.queryByText(/^Index /)).not.toBeInTheDocument();
  });

  // AC-27: a stale tour says so and offers Regenerate
  it("AC-27: a stale tour shows 'Index moved since this tour was built' with a working Regenerate", () => {
    renderHeader(makeView({ stale: true }));
    const banner = screen.getByRole("status");
    expect(within(banner).getByText("Index moved since this tour was built")).toBeInTheDocument();
    fireEvent.click(within(banner).getByRole("button", { name: "Regenerate" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("AC-27: a fresh tour shows no stale banner", () => {
    renderHeader(makeView({ stale: false }));
    expect(screen.queryByText("Index moved since this tour was built")).not.toBeInTheDocument();
  });

  // AC-18/19: the failure is reported with its mapped reason, and the stored tour stays offered
  it("AC-18/AC-19: a failed generation shows the reason and, for a missing key, the model settings link", () => {
    renderHeader(
      makeView({ last_failure: { reason: "no_key", message: "No key for anthropic", at: "2026-10-05T11:00:00Z" } }),
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(onboarding.failure.no_key);
    expect(alert).toHaveTextContent("No key for anthropic");
    expect(within(alert).getByRole("link", { name: "Open model settings" })).toHaveAttribute("href", "/settings/models");
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
  });

  // AC-32: Share copies the studio deep link and confirms
  it("AC-32: Share link copies this repo's tour URL and toasts 'Link copied'", async () => {
    renderHeader(makeView());
    fireEvent.click(screen.getByRole("button", { name: "Share link" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Link copied"));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/repos/r1/onboarding-tour`);
  });

  // AC-32: a refused clipboard must not claim the link was copied
  it("AC-32: a clipboard failure toasts the failure, not 'Link copied'", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    renderHeader(makeView());
    fireEvent.click(screen.getByRole("button", { name: "Share link" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not copy"));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
