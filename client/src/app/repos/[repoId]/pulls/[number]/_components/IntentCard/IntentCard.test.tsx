/**
 * IntentCard (spec 006) — the classifier's structured output rendered on the
 * Overview tab. Data comes entirely from `usePrIntent`/`useClassifyIntent`
 * (`@/lib/hooks/intent`), which are mocked here — the card itself only derives
 * UI state from what those hooks return (`helpers.ts`).
 *
 * `fireEvent`, not `userEvent` — that package is not a dependency
 * (client/INSIGHTS.md). Mocking a SUBMODULE of the hooks barrel directly
 * (`@/lib/hooks/intent`) rather than the whole `@/lib/hooks` re-export avoids
 * the "bare factory strips sibling exports" trap, since nothing else in this
 * tree imports another hook from that barrel.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord, PrIntentResponse } from "@devdigest/shared";
import brief from "../../../../../../../../messages/en/brief.json";

const { usePrIntentMock, useClassifyIntentMock } = vi.hoisted(() => ({
  usePrIntentMock: vi.fn(),
  useClassifyIntentMock: vi.fn(),
}));
vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: usePrIntentMock,
  useClassifyIntent: useClassifyIntentMock,
}));

import { IntentCard } from "./IntentCard";

const M = brief.intentCard;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function record(overrides: Partial<PrIntentRecord> = {}): PrIntentRecord {
  return {
    intent: "Add rate limiting to the public API endpoints",
    in_scope: ["Add limiter middleware"],
    out_of_scope: ["Auth changes"],
    confidence: "high",
    pr_id: "pr1",
    head_sha: "a1b2c3d4",
    description_hash: "hash1",
    stale: false,
    stale_reason: null,
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    sources: [{ kind: "pr_title", ref: "PR title", status: "ok", chars: 40 }],
    missing_context: [],
    composition: [],
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: 0.001,
    cost_source: "api",
    classified_at: "2026-09-26T00:00:00Z",
    ...overrides,
  };
}

function respond(intent: PrIntentRecord | null, prHeadSha = "a1b2c3d4"): PrIntentResponse {
  return { intent, pr_head_sha: prHeadSha };
}

function mockLoaded(resp: PrIntentResponse | undefined, isError = false) {
  usePrIntentMock.mockReturnValue({ data: resp, isLoading: false, isError });
}

function mockClassify(overrides: Partial<{ mutate: () => void; isPending: boolean; isError: boolean }> = {}) {
  useClassifyIntentMock.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    ...overrides,
  });
}

function renderCard(prId: string | null = "pr1") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief }}>
      <IntentCard prId={prId} />
    </NextIntlClientProvider>,
  );
}

describe("IntentCard — ok state", () => {
  it("renders the summary, scopes, sources and re-classifies on click", () => {
    const mutate = vi.fn();
    mockLoaded(respond(record()));
    mockClassify({ mutate });

    renderCard();

    expect(screen.getByText(/Add rate limiting to the public API endpoints/)).toBeInTheDocument();
    expect(screen.getByText("Add limiter middleware")).toBeInTheDocument();
    expect(screen.getByText("Auth changes")).toBeInTheDocument();
    expect(screen.getByText(M.confidence.high)).toBeInTheDocument();
    expect(screen.getByText("PR title")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: M.reclassify }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});

describe("IntentCard — empty / low-confidence / missing-context each have distinct copy", () => {
  it("shows the empty-state copy when no intent has been classified yet", () => {
    mockLoaded(respond(null));
    mockClassify();
    renderCard();
    expect(screen.getByText(M.empty)).toBeInTheDocument();
    expect(screen.getByText(M.emptyHint)).toBeInTheDocument();
  });

  it("shows the low-confidence warning distinct from the missing-context one", () => {
    mockLoaded(respond(record({ confidence: "low", missing_context: [] })));
    mockClassify();
    renderCard();
    expect(screen.getByText(M.lowConfidence)).toBeInTheDocument();
    expect(screen.queryByText(M.missingContext)).not.toBeInTheDocument();
  });

  it("shows the missing-context warning (takes priority over low confidence)", () => {
    mockLoaded(
      respond(
        record({
          confidence: "low",
          missing_context: [{ kind: "linked_doc", ref: "docs/plan.md", reason: "not_found" }],
        }),
      ),
    );
    mockClassify();
    renderCard();
    expect(screen.getByText(M.missingContext)).toBeInTheDocument();
    expect(screen.queryByText(M.lowConfidence)).not.toBeInTheDocument();
  });
});

describe("IntentCard — stale badge", () => {
  it("shows the head-moved copy when the PR has new commits", () => {
    mockLoaded(respond(record({ stale: true, stale_reason: "head_moved" })));
    mockClassify();
    renderCard();
    expect(screen.getByText(M.staleHeadMoved)).toBeInTheDocument();
    expect(screen.queryByText(M.staleDescriptionChanged)).not.toBeInTheDocument();
  });

  it("shows the description-changed copy — distinct from head-moved — when only the body changed", () => {
    mockLoaded(respond(record({ stale: true, stale_reason: "description_changed" })));
    mockClassify();
    renderCard();
    expect(screen.getByText(M.staleDescriptionChanged)).toBeInTheDocument();
    expect(screen.queryByText(M.staleHeadMoved)).not.toBeInTheDocument();
  });
});

describe("IntentCard — V8: a failed load gets its own copy, distinct from 'not classified yet'", () => {
  it("renders the loadError alert instead of the empty-state copy", () => {
    mockLoaded(undefined, true);
    mockClassify();
    renderCard();
    expect(screen.getByRole("alert")).toHaveTextContent(M.loadError);
    expect(screen.queryByText(M.empty)).not.toBeInTheDocument();
  });
});
