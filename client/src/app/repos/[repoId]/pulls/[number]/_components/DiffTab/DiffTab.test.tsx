/**
 * Smart order (spec 007): the route's grouping decides which role each file
 * lands in and which files carry findings; `joinGroups` (helpers.ts) attaches
 * the actual PrFile so DiffViewer can render its patch. This test walks the
 * whole default flow: grouped + collapsed-by-default groups, a group's
 * finding marker, and the escape hatch back to the flat "Original order".
 *
 * `fireEvent`, not `userEvent` — that package is not a dependency of this
 * package (client/insights/gotchas.md).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { DiffTarget } from "@/components/diff-viewer";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";

// Flow 2 sets this before rendering; flow 1 leaves it empty (no latest review).
let CURRENT_REVIEWS: ReviewRecord[] | undefined = [];
// Flow 3's last case sets this to one comment; every other flow leaves it empty.
let CURRENT_COMMENTS: unknown[] = [];
const mutateMock = vi.fn();

vi.mock("../../../../../../../lib/hooks/reviews", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  usePrComments: () => ({ data: CURRENT_COMMENTS }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePrReviews: () => ({ data: CURRENT_REVIEWS }),
  useFindingAction: () => ({ mutate: mutateMock, isPending: false, variables: undefined }),
}));

const SMART_DIFF: SmartDiffResponse = {
  groups: [
    {
      role: "core",
      files: [
        { path: "src/limiter.ts", pseudocode_summary: null, additions: 10, deletions: 2, finding_lines: [12, 45, 46] },
        { path: "src/index.ts", pseudocode_summary: null, additions: 3, deletions: 1, finding_lines: [3, 4] },
      ],
    },
    {
      role: "tests",
      files: [
        { path: "src/limiter.test.ts", pseudocode_summary: null, additions: 8, deletions: 0, finding_lines: [] },
      ],
    },
    {
      role: "wiring",
      files: [{ path: "vitest.config.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] }],
    },
    {
      role: "docs",
      files: [{ path: "README.md", pseudocode_summary: null, additions: 2, deletions: 0, finding_lines: [] }],
    },
    {
      role: "boilerplate",
      files: [{ path: "pnpm-lock.yaml", pseudocode_summary: null, additions: 50, deletions: 10, finding_lines: [] }],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 74, proposed_splits: [] },
};

vi.mock("../../../../../../../lib/hooks/smart-diff", () => ({
  useSmartDiff: () => ({ data: SMART_DIFF, isLoading: false, isError: false }),
}));

import { DiffTab } from "./DiffTab";

afterEach(() => {
  cleanup();
  CURRENT_REVIEWS = [];
  CURRENT_COMMENTS = [];
  mutateMock.mockClear();
});

// The patch that anchors a finding on RIGHT:12 — a hunk starting at line 10
// with two added lines, the second landing on 12.
const LIMITER_PATCH = ["@@ -10,2 +10,3 @@", " context10", "+added11", "+added12"].join("\n");

// Deliberately NOT in role order — this is what "Original order" must
// preserve, as opposed to the smart grouping above.
const FILES: PrFile[] = [
  { path: "pnpm-lock.yaml", additions: 50, deletions: 10, patch: null },
  { path: "README.md", additions: 2, deletions: 0, patch: null },
  { path: "vitest.config.ts", additions: 1, deletions: 0, patch: null },
  { path: "src/limiter.test.ts", additions: 8, deletions: 0, patch: null },
  { path: "src/limiter.ts", additions: 10, deletions: 2, patch: LIMITER_PATCH },
  { path: "src/index.ts", additions: 3, deletions: 1, patch: null },
];

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Missing rate limit on the login route",
    file: "src/limiter.ts",
    start_line: 12,
    end_line: 12,
    rationale: "There is no limiter on this route.",
    suggestion: "Add the shared rate limiter.",
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function review(o: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "rv1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "Agent",
    kind: "review",
    verdict: "request_changes",
    summary: "…",
    score: 40,
    model: "m1",
    grounding: null,
    created_at: "2026-09-26T00:00:00Z",
    findings: [finding()],
    ...o,
  };
}

function renderTab(target?: DiffTarget | null) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <DiffTab prId="pr1" filesCount={FILES.length} files={FILES} canComment target={target} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function groupHeaders() {
  return screen.queryAllByRole("button").filter((b) => b.hasAttribute("aria-expanded"));
}

describe("DiffTab — Smart order grouping and the toggle back to Original order", () => {
  it("groups by role with docs/boilerplate collapsed, marks a group's finding count, and Original order shows the flat file-prop order", () => {
    renderTab();

    // 1. Groups render in role order.
    const headers = groupHeaders();
    expect(headers).toHaveLength(5);
    expect(headers.map((h) => h.textContent)).toEqual([
      expect.stringContaining(prReview.smartDiff.coreLabel),
      expect.stringContaining(prReview.smartDiff.testsLabel),
      expect.stringContaining(prReview.smartDiff.wiringLabel),
      expect.stringContaining(prReview.smartDiff.docsLabel),
      expect.stringContaining(prReview.smartDiff.boilerplateLabel),
    ]);

    // 2. Docs and Boilerplate start collapsed; the rest start open.
    expect(headers[0]).toHaveAttribute("aria-expanded", "true");
    expect(headers[1]).toHaveAttribute("aria-expanded", "true");
    expect(headers[2]).toHaveAttribute("aria-expanded", "true");
    expect(headers[3]).toHaveAttribute("aria-expanded", "false");
    expect(headers[4]).toHaveAttribute("aria-expanded", "false");

    // 3. Clicking the collapsed Boilerplate header reveals its file.
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument();
    fireEvent.click(headers[4]!);
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();

    // 4. The core group's header shows the ●2 finding-file marker (2 files
    //    with findings — 5 finding lines total — not 5).
    expect(screen.getByLabelText("2 files with findings")).toBeInTheDocument();

    // 5. Switching to Original order checks that radio and renders the flat
    //    `files` prop order (which deliberately differs from role order).
    const originalRadio = screen.getByRole("radio", { name: prReview.smartDiff.originalOrder });
    expect(originalRadio).toHaveAttribute("aria-checked", "false");
    fireEvent.click(originalRadio);
    expect(originalRadio).toHaveAttribute("aria-checked", "true");
    expect(groupHeaders()).toHaveLength(0);

    const html = document.body.textContent ?? "";
    const indices = FILES.map((f) => html.indexOf(f.path));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]!);
    }
  });
});

describe("DiffTab — inline findings from the latest review (S14)", () => {
  it("shows the file dot and an inline card under line 12, dismisses through the mutation, and survives the order toggle", () => {
    CURRENT_REVIEWS = [review()];
    renderTab();

    // 1. The file dot shows (annotations.markedPaths marks src/limiter.ts).
    expect(screen.getAllByLabelText(prReview.smartDiff.hasFindings).length).toBeGreaterThan(0);

    // 2. The inline card renders under line 12 with the "blocker" label. Two
    //    matches by design (S27): the line's marker pill and the card's own
    //    severity word both say "blocker" — not a query bug (client/insights/
    //    gotchas.md).
    expect(screen.getAllByText("blocker").length).toBeGreaterThan(0);
    expect(screen.getByText("Missing rate limit on the login route")).toBeInTheDocument();

    // 3. Dismiss calls the mutation with the finding + PR id.
    fireEvent.click(screen.getByRole("button", { name: prReview.finding.dismiss }));
    expect(mutateMock).toHaveBeenCalledWith({ findingId: "f1", action: "dismiss", prId: "pr1" });

    // 4. In Original order the same card still renders.
    fireEvent.click(screen.getByRole("radio", { name: prReview.smartDiff.originalOrder }));
    expect(screen.getByText("Missing rate limit on the login route")).toBeInTheDocument();
  });
});

describe("DiffTab — shared comments/findings toggle (D13-C, D16-A, S24)", () => {
  it("hides and reveals inline content while markers, the file dot and the group counter stay", () => {
    CURRENT_REVIEWS = [review()];
    renderTab();
    const toggle = () => screen.getByRole("button", { name: /comments/i });

    // 1. One finding, no comments → shown by default, "Hide comments (1)".
    expect(toggle()).toHaveTextContent(prReview.smartDiff.hideComments.replace("{count}", "1"));
    expect(screen.getByText("Missing rate limit on the login route")).toBeInTheDocument();

    // 2. Click → content hides; the marker pill, file dot and group ●N stay.
    fireEvent.click(toggle());
    expect(toggle()).toHaveTextContent(prReview.smartDiff.showComments.replace("{count}", "1"));
    expect(screen.queryByText("Missing rate limit on the login route")).not.toBeInTheDocument();
    expect(screen.getAllByText("blocker").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(prReview.smartDiff.hasFindings).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("2 files with findings")).toBeInTheDocument();

    // 3. Click → the card is back.
    fireEvent.click(toggle());
    expect(screen.getByText("Missing rate limit on the login route")).toBeInTheDocument();
  });

  it("with comments only (no findings), defaults to hidden", () => {
    CURRENT_REVIEWS = [];
    CURRENT_COMMENTS = [{ id: 1 }];
    renderTab();

    expect(screen.getByRole("button", { name: /comments/i })).toHaveTextContent(
      prReview.smartDiff.showComments.replace("{count}", "1"),
    );
  });
});

describe("DiffTab — 'review not run yet' empty state (D14-A, S23/S24)", () => {
  it("shows before any kind='review' review and hides once one exists", () => {
    CURRENT_REVIEWS = [];
    renderTab();
    expect(screen.getByText(prReview.smartDiff.reviewNotRun)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /comments/i })).not.toBeInTheDocument();
    cleanup();

    CURRENT_REVIEWS = [review({ kind: "summary" })];
    renderTab();
    expect(screen.getByText(prReview.smartDiff.reviewNotRun)).toBeInTheDocument();
    cleanup();

    CURRENT_REVIEWS = [review()];
    renderTab();
    expect(screen.queryByText(prReview.smartDiff.reviewNotRun)).not.toBeInTheDocument();
  });
});

describe("DiffTab — navigation target (PR Brief → diff)", () => {
  it("opens the collapsed docs group and scrolls to the target file's header once", () => {
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      renderTab({ path: "README.md", line: null, nonce: 1 });
      const docs = groupHeaders()[3]!;
      expect(docs).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText("README.md")).toBeInTheDocument();
      expect(scroll).toHaveBeenCalledTimes(1);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});
