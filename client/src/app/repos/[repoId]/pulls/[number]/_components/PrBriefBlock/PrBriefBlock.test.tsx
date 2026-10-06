/**
 * PrBriefBlock — the PR Brief section (spec 010). Hook modules are mocked with
 * `importActual` spread so the cards' other imports survive (client gotchas → Tests).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import brief from "../../../../../../../../messages/en/brief.json";
import blast from "../../../../../../../../messages/en/blast.json";
import prReview from "../../../../../../../../messages/en/prReview.json";

const state = vi.hoisted(() => ({
  view: undefined as unknown,
  isLoading: false,
  mutate: undefined as unknown as ReturnType<typeof vi.fn>,
  mutation: { isPending: false, isError: false },
  reviews: [] as unknown[],
  runs: [] as unknown[],
}));

vi.mock("@/lib/hooks/brief", async (orig) => ({
  ...(await orig<typeof import("@/lib/hooks/brief")>()),
  usePrBrief: () => ({ data: state.view, isLoading: state.isLoading, isError: false, refetch: vi.fn() }),
  useGeneratePrBrief: () => ({ mutate: state.mutate, ...state.mutation }),
}));
vi.mock("@/lib/hooks/reviews", async (orig) => ({
  ...(await orig<typeof import("@/lib/hooks/reviews")>()),
  usePrReviews: () => ({ data: state.reviews }),
  usePrRuns: () => ({ data: state.runs }),
}));
vi.mock("@/lib/hooks/intent", async (orig) => ({
  ...(await orig<typeof import("@/lib/hooks/intent")>()),
  usePrIntent: () => ({ data: { intent: null, pr_head_sha: "a" }, isLoading: false, isError: false }),
  useClassifyIntent: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock("@/lib/hooks/blast", async (orig) => ({
  ...(await orig<typeof import("@/lib/hooks/blast")>()),
  useBlastRadius: () => ({ data: undefined, isLoading: true, isError: false }),
  usePrHistory: () => ({ data: { status: "ok", history: [] }, isLoading: false, isError: false }),
}));
vi.mock("@/lib/hooks/repo-intel", async (orig) => ({
  ...(await orig<typeof import("@/lib/hooks/repo-intel")>()),
  useResyncRepoIntel: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useRepoIntelStatus: () => ({ data: undefined }),
}));

import { PrBriefBlock } from "./PrBriefBlock";

const BRIEF = {
  summary: "![x](http://e/x.png) <img src=x>",
  risks: {
    risks: [
      {
        kind: "security",
        title: "Token handling",
        explanation: "The token is logged.",
        severity: "high",
        file_refs: ["src/a.ts", "src/b.ts"],
      },
    ],
  },
  review_focus: [
    { file: "src/a.ts", line: 10, reason: "check auth" },
    { file: "src/gone.ts", line: 3, reason: "removed file" },
  ],
  missing_inputs: [{ input: "intent", status: "missing", ref: null, reason: null }],
  head_sha: "abc",
  generated_at: "2026-10-06T00:00:00Z",
  model: { provider: "openai", model: "m" },
  usage: { tokens_in: 8200, tokens_out: 1300, cost_usd: 0.014, cost_source: "api" },
};

const makeView = (over: Record<string, unknown> = {}) => ({
  pr_id: "pr1",
  pr_head_sha: "abc",
  brief: BRIEF,
  stale: false,
  generating: false,
  failure: null,
  ...over,
});

const onOpenInDiff = vi.fn();

function renderBlock(prHeadSha = "abc") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief, blast, prReview }}>
      <PrBriefBlock
        prId="pr1"
        prHeadSha={prHeadSha}
        repo={null}
        diffPaths={["src/a.ts", "src/b.ts"]}
        onOpenInDiff={onOpenInDiff}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  state.view = makeView();
  state.isLoading = false;
  state.mutate = vi.fn();
  state.mutation = { isPending: false, isError: false };
  state.reviews = [];
  state.runs = [];
  onOpenInDiff.mockReset();
});
afterEach(cleanup);

describe("PrBriefBlock", () => {
  it("renders model text as plain text, never calls the mutation on render, and shows the coverage block for missing inputs", () => {
    const { container } = renderBlock();

    expect(screen.getByText("![x](http://e/x.png) <img src=x>")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(state.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: brief.prBrief.coverage.title })).toHaveTextContent("missingintent");
    expect(screen.getByText(brief.prBrief.reviewFocus)).toBeInTheDocument();
    expect(screen.getByLabelText("2 items")).toBeInTheDocument();
    expect(screen.queryByText("PR has new commits")).not.toBeInTheDocument();
  });

  it("expands a risk to show the explanation and every ref, with an accessible severity", () => {
    renderBlock();

    expect(screen.getByRole("img", { name: "High severity" })).toBeInTheDocument();
    expect(screen.queryByText("The token is logged.")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Show details" });
    expect(toggle).toHaveAttribute("aria-label", "Show details");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide details" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("The token is logged.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide details" }));
    expect(screen.getByRole("button", { name: "Show details" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    expect(screen.getByRole("button", { name: "src/b.ts" })).toBeInTheDocument();
  });

  it("opens a focus item in the diff, and explains a path that is not in the diff", () => {
    renderBlock();

    fireEvent.click(screen.getByRole("button", { name: "src/a.ts:10" }));
    expect(onOpenInDiff).toHaveBeenCalledWith("src/a.ts", 10);

    fireEvent.click(screen.getByRole("button", { name: "src/gone.ts:3" }));
    expect(onOpenInDiff).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("File not in this PR's diff");
  });

  it("shows the stale note when the PR head moved even if the server says fresh", () => {
    renderBlock("def");
    expect(screen.getByText("PR has new commits")).toBeInTheDocument();
  });

  it("explains what Generate brief does while no brief exists, and hides it once a brief or a failure is shown", () => {
    state.view = makeView({ brief: null });
    const a = renderBlock();
    expect(screen.getByText(brief.unavailable)).toBeInTheDocument();
    expect(screen.getByText(brief.unavailableHint)).toBeInTheDocument();
    a.unmount();

    state.view = makeView({ brief: null, failure: "no_key" });
    const b = renderBlock();
    expect(screen.queryByText(brief.unavailable)).not.toBeInTheDocument();
    b.unmount();

    state.view = makeView();
    renderBlock();
    expect(screen.queryByText(brief.unavailable)).not.toBeInTheDocument();
  });

  it("generates only on click and disables the button while pending", () => {
    state.view = makeView({ brief: null });
    const { unmount } = renderBlock();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(state.mutate).toHaveBeenCalledWith("pr1");
    unmount();

    state.mutation = { isPending: true, isError: false };
    renderBlock();
    expect(screen.getByRole("button", { name: /Generate brief/ })).toBeDisabled();
  });

  it("tells no_key, over_budget and failed apart", () => {
    state.view = makeView({ brief: null, failure: "no_key" });
    const a = renderBlock();
    expect(screen.getByRole("link", { name: "Open model settings" })).toHaveAttribute("href", "/settings/models");
    a.unmount();

    state.view = makeView({ brief: null, failure: "over_budget" });
    const b = renderBlock();
    expect(screen.getByText(brief.prBrief.overBudget)).toBeInTheDocument();
    expect(screen.queryByText(brief.prBrief.error)).not.toBeInTheDocument();
    b.unmount();

    state.view = makeView({ brief: null, failure: "failed" });
    renderBlock();
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText(brief.prBrief.error, { exact: false })).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(state.mutate).toHaveBeenCalledWith("pr1");
  });

  it("shows the verdict banner only when a review exists, and renders the cards without a brief", () => {
    state.view = makeView({ brief: null });
    const a = renderBlock();
    const section = screen.getByText("PR Brief").closest("section") as HTMLElement;
    expect(within(section).getByText("Intent")).toBeInTheDocument();
    expect(within(section).getByText(blast.title)).toBeInTheDocument();
    a.unmount();

    state.view = makeView();
    const b = renderBlock();
    expect(screen.queryByText("Request changes")).not.toBeInTheDocument();
    b.unmount();

    state.reviews = [
      {
        kind: "review",
        verdict: "request_changes",
        score: 40,
        agent_name: "Security",
        findings: [{ severity: "CRITICAL", dismissed_at: null }],
      },
    ];
    renderBlock();
    expect(screen.getByText("Request changes")).toBeInTheDocument();
  });

  const REVIEW = {
    kind: "review",
    verdict: "request_changes",
    score: 61,
    agent_name: "Security",
    run_id: "run1",
    findings: [{ severity: "CRITICAL", dismissed_at: null }],
  };

  // designs 22/36/37: summary in the banner, both costs under the score
  it("puts the summary inside the verdict banner and both cost lines under the PR score", () => {
    state.reviews = [REVIEW];
    state.runs = [{ run_id: "run1", tokens_in: 3400, tokens_out: 560, cost_usd: 0.0021, cost_source: "estimate" }];
    renderBlock();

    const summary = screen.getByText(/img src=x/);
    expect(summary.parentElement).toHaveTextContent("Request changes");
    expect(screen.getByText("PR SCORE")).toBeInTheDocument();
    const reviewLine = screen.getByText(brief.prBrief.cost.review).parentElement as HTMLElement;
    expect(reviewLine).toHaveTextContent("~$0.0021");
    expect(reviewLine).toHaveTextContent("3.4K→560");
    const briefLine = screen.getByText(brief.prBrief.cost.brief).parentElement as HTMLElement;
    expect(briefLine).toHaveTextContent("$0.014");
    expect(briefLine).toHaveTextContent("8.2K→1.3K");
  });

  it("shows an em dash for a review whose run has no usage, and only the Brief line without a review", () => {
    state.reviews = [REVIEW];
    const a = renderBlock();
    const reviewLine = screen.getByText(brief.prBrief.cost.review).parentElement as HTMLElement;
    expect(reviewLine).toHaveTextContent("—");
    expect(reviewLine).toHaveTextContent("—→—");
    a.unmount();

    state.reviews = [];
    renderBlock();
    expect(screen.queryByText(brief.prBrief.cost.review)).not.toBeInTheDocument();
    expect(screen.getByText(brief.prBrief.cost.brief)).toBeInTheDocument();
    expect(screen.getByText(/img src=x/)).toBeInTheDocument();
  });

  it("omits the Brief line when the stored brief has no usage", () => {
    state.view = makeView({ brief: { ...BRIEF, usage: undefined } });
    renderBlock();
    expect(screen.queryByText(brief.prBrief.cost.brief)).not.toBeInTheDocument();
  });

  it("renders Risk areas as their own card after the columns and before Review focus, and the focus card with a count badge and a list", () => {
    renderBlock();
    const intentCard = screen.getByText("Intent").closest("div[style]") as HTMLElement;
    const risksHeading = screen.getByRole("heading", { name: new RegExp(brief.prBrief.riskAreas) });
    expect(intentCard).not.toContainElement(risksHeading);
    expect(within(intentCard.parentElement as HTMLElement).queryByText(brief.prBrief.riskAreas)).not.toBeInTheDocument();
    expect(within(risksHeading).getByText("1")).toBeInTheDocument();
    expect(screen.getByLabelText("1 risk")).toBeInTheDocument();
    expect(within(risksHeading.parentElement as HTMLElement).getByText("Token handling")).toBeInTheDocument();

    const heading = screen.getByRole("heading", { name: new RegExp(brief.prBrief.reviewFocus) });
    expect(within(heading).getByText("2")).toBeInTheDocument();
    expect(risksHeading.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const blast = screen.getByText(/Blast radius/i);
    expect(blast.compareDocumentPosition(risksHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const list = heading.parentElement!.querySelector("ul") as HTMLElement;
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(list).toHaveTextContent("src/a.ts:10 — check auth");
    // each item carries a visible, decorative accent bullet (designs 22/37)
    for (const li of within(list).getAllByRole("listitem")) {
      const bullet = within(li).getByTestId("focus-bullet");
      expect(bullet).toHaveAttribute("aria-hidden", "true");
      expect(bullet.textContent).toBeTruthy();
    }
  });

  // every model-written field renders as literal text: no markup, no link, no image is created
  it("renders risk and focus text from the model literally, creating no elements", () => {
    const html = '<img src=x onerror=alert(1)> [l](javascript:alert(1))';
    state.view = makeView({
      brief: {
        ...BRIEF,
        risks: { risks: [{ ...BRIEF.risks.risks[0], title: html, explanation: html }] },
        review_focus: [{ file: "src/a.ts", line: 10, reason: html }],
      },
    });
    const { container } = renderBlock();
    fireEvent.click(screen.getByRole("button", { name: "Show details" }));

    expect(screen.getAllByText(html, { exact: false }).length).toBeGreaterThanOrEqual(3);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a[href^='javascript']")).toBeNull();
  });

  // a failed regeneration keeps the stored brief on screen next to the error
  it("keeps the stored brief visible when a regeneration failed", () => {
    state.view = makeView({ failure: "failed" });
    renderBlock();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Token handling")).toBeInTheDocument();
  });

  // opening a risk ref outside the diff must not navigate
  it("does not navigate for a risk ref that is not in the diff", () => {
    state.view = makeView({
      brief: { ...BRIEF, risks: { risks: [{ ...BRIEF.risks.risks[0], file_refs: ["../../etc/passwd"] }] } },
    });
    renderBlock();
    fireEvent.click(screen.getByRole("button", { name: "../../etc/passwd" }));
    expect(onOpenInDiff).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("File not in this PR's diff");
  });

  // AC-27: an empty list says so instead of rendering nothing
  it("shows the empty states for no risks and no review focus", () => {
    state.view = makeView({ brief: { ...BRIEF, risks: { risks: [] }, review_focus: [] } });
    renderBlock();
    expect(screen.getByText(brief.noRisks)).toBeInTheDocument();
    expect(screen.getByText(brief.prBrief.noFocus)).toBeInTheDocument();
  });

  // AC-22: no gaps, no coverage block
  it("shows no coverage block when nothing is missing", () => {
    state.view = makeView({ brief: { ...BRIEF, missing_inputs: [] } });
    renderBlock();
    expect(screen.queryByText(brief.prBrief.coverage.title)).not.toBeInTheDocument();
  });

  // AC-22: grouped rows with a reason, refs behind a toggle
  it("groups attached specs into one row with a count and reveals the refs on demand", () => {
    const spec = (ref: string) => ({ input: "attached_specs", status: "missing", ref, reason: "missing" });
    state.view = makeView({ brief: { ...BRIEF, missing_inputs: [spec("a.md"), spec("b.md"), spec("c.md")] } });
    renderBlock();
    const block = screen.getByRole("group", { name: brief.prBrief.coverage.title });
    expect(block).toHaveTextContent("attached specs — 3 files not found in this repo");
    expect(within(block).queryByText("a.md")).not.toBeInTheDocument();
    const toggle = within(block).getByRole("button", { name: "Show 3 items" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(within(block).getByText("a.md")).toBeInTheDocument();
    expect(within(block).getByRole("button", { name: "Hide" })).toHaveAttribute("aria-expanded", "true");
  });

  it("shows a partial chip with the repo-not-indexed reason, and a stale intent row", () => {
    state.view = makeView({
      brief: {
        ...BRIEF,
        missing_inputs: [
          { input: "blast_radius", status: "partial", ref: null, reason: "no_data" },
          { input: "intent", status: "stale", ref: null, reason: "head_moved" },
        ],
      },
    });
    renderBlock();
    const block = screen.getByRole("group", { name: brief.prBrief.coverage.title });
    expect(block).toHaveTextContent("partialblast radius — repo not indexed");
    expect(block).toHaveTextContent("staleintent — PR has new commits since classification");
  });

  // AC-13: a truncated input is noted
  it("notes a truncated input", () => {
    state.view = makeView({
      brief: { ...BRIEF, missing_inputs: [{ input: "pr_description", status: "truncated", ref: null, reason: null }] },
    });
    renderBlock();
    expect(screen.getByRole("group", { name: brief.prBrief.coverage.title })).toHaveTextContent("truncatedPR description");
  });

  // AC-4: while generating, a skeleton replaces the brief
  it("shows a skeleton instead of the brief while the mutation is pending or the view is generating", () => {
    state.mutation = { isPending: true, isError: false };
    const a = renderBlock();
    expect(a.container.querySelector(".skeleton")).not.toBeNull();
    expect(screen.queryByText("Token handling")).not.toBeInTheDocument();
    a.unmount();

    state.mutation = { isPending: false, isError: false };
    state.view = makeView({ generating: true });
    const b = renderBlock();
    expect(b.container.querySelector(".skeleton")).not.toBeNull();
    expect(screen.queryByText("Token handling")).not.toBeInTheDocument();
  });
});
