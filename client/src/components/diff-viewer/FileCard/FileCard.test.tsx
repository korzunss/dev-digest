/**
 * FileCard — dot, bar/label and content injection for line annotations (spec
 * 007, S12). diff-viewer stays finding-agnostic: an annotation is plain data
 * with a `ReactNode` content slot, never anything route-specific — the
 * feature that fills the slot lives elsewhere and is opaque here.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import shell from "../../../../messages/en/shell.json";
import type { DiffAnnotationApi, DiffLineAnnotation } from "../annotations";
import { FileCard } from "./FileCard";

afterEach(cleanup);

const PATCH = ["@@ -1,2 +1,3 @@", " context line", "+added line", " another context"].join("\n");

const FILE: PrFile = { path: "src/limiter.ts", additions: 1, deletions: 0, patch: PATCH };

function annotation(o: Partial<DiffLineAnnotation> = {}): DiffLineAnnotation {
  return {
    id: "a1",
    path: FILE.path,
    line: 2, // the "+added line" row's RIGHT line number
    color: "var(--crit)",
    label: "blocker",
    content: <div>Finding body</div>,
    ...o,
  };
}

function renderCard(annotations?: DiffAnnotationApi) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell }}>
      <FileCard file={FILE} annotations={annotations} />
    </NextIntlClientProvider>,
  );
}

describe("FileCard — finding-agnostic annotations", () => {
  it("shows the header dot, the matched line's bar label, and the injected content", () => {
    const api: DiffAnnotationApi = {
      items: [annotation()],
      markedPaths: new Set([FILE.path]),
      markerLabel: "Has findings",
      unanchoredTitle: "Findings outside the shown diff",
    };
    renderCard(api);

    expect(screen.getByLabelText("Has findings")).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.getByText("Finding body")).toBeInTheDocument();
  });

  it("renders an annotation with no color/label as content only, without a bar label", () => {
    const api: DiffAnnotationApi = {
      items: [annotation({ color: undefined, label: undefined })],
      markedPaths: new Set([FILE.path]),
      markerLabel: "Has findings",
      unanchoredTitle: "Findings outside the shown diff",
    };
    renderCard(api);

    expect(screen.getByText("Finding body")).toBeInTheDocument();
    expect(screen.queryByText("blocker")).not.toBeInTheDocument();
  });

  it("renders a finding whose line isn't in the shown diff under the unanchored title", () => {
    const api: DiffAnnotationApi = {
      items: [annotation({ id: "a2", line: 99, content: <div>Off-patch finding</div> })],
      markedPaths: new Set([FILE.path]),
      markerLabel: "Has findings",
      unanchoredTitle: "Findings outside the shown diff",
    };
    renderCard(api);

    expect(screen.getByText("Findings outside the shown diff")).toBeInTheDocument();
    expect(screen.getByText("Off-patch finding")).toBeInTheDocument();
  });

  it("with showContent:false keeps the dot and the bar label but hides injected content", () => {
    const api: DiffAnnotationApi = {
      items: [annotation(), annotation({ id: "a2", line: 99, content: <div>Off-patch finding</div> })],
      markedPaths: new Set([FILE.path]),
      markerLabel: "Has findings",
      unanchoredTitle: "Findings outside the shown diff",
      showContent: false,
    };
    renderCard(api);

    expect(screen.getByLabelText("Has findings")).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument();
    expect(screen.queryByText("Finding body")).not.toBeInTheDocument();
    expect(screen.queryByText("Findings outside the shown diff")).not.toBeInTheDocument();
    expect(screen.queryByText("Off-patch finding")).not.toBeInTheDocument();
  });
});

describe("FileCard — range annotations (D18-A, S26)", () => {
  // Hunk starting at new line 60: 61 is added, 62 is unchanged context, then
  // 63-73 are added — so the 61-73 range has 12 rendered "add" lines and one
  // rendered "ctx" line (62) that must get no pill.
  const RANGE_PATCH = [
    "@@ -60,3 +60,14 @@",
    " context60",
    "+added61",
    " context62",
    "+added63",
    "+added64",
    "+added65",
    "+added66",
    "+added67",
    "+added68",
    "+added69",
    "+added70",
    "+added71",
    "+added72",
    "+added73",
  ].join("\n");
  const RANGE_FILE: PrFile = { path: "src/range.ts", additions: 12, deletions: 0, patch: RANGE_PATCH };

  function rangeAnnotation(o: Partial<DiffLineAnnotation> = {}): DiffLineAnnotation {
    return {
      id: "r1",
      path: RANGE_FILE.path,
      line: 61,
      endLine: 73,
      color: "var(--crit)",
      label: "blocker",
      content: <div>Range finding body</div>,
      ...o,
    };
  }

  function renderRangeCard(annotations: DiffAnnotationApi) {
    return render(
      <NextIntlClientProvider locale="en" messages={{ shell }}>
        <FileCard file={RANGE_FILE} annotations={annotations} />
      </NextIntlClientProvider>,
    );
  }

  it("marks every rendered added line in the range, not context lines, and renders content once under the last one", () => {
    const api: DiffAnnotationApi = {
      items: [rangeAnnotation()],
      markedPaths: new Set([RANGE_FILE.path]),
      markerLabel: "Has findings",
      unanchoredTitle: "Findings outside the shown diff",
    };
    renderRangeCard(api);

    // 12 rendered added lines (61, 63-73) all get the pill — one label per line.
    expect(screen.getAllByText("blocker")).toHaveLength(12);
    expect(screen.getAllByText("Range finding body")).toHaveLength(1);

    // Line 62 (context, not in the added-lines set) gets no pill of its own.
    const row62 = screen.getByText("62").closest("div")!;
    expect(within(row62).queryByText("blocker")).not.toBeInTheDocument();

    // The content anchors on the last marked line (73) and renders after its
    // row in DOM order.
    const row73 = screen.getByText("73").closest("div")!;
    const content = screen.getByText("Range finding body");
    expect(row73.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("anchors on start_line when no line of the range is an added line but start_line is rendered", () => {
    const ctxOnlyPatch = ["@@ -61,3 +61,3 @@", " context61", " context62", " context63"].join("\n");
    const file: PrFile = { path: "src/ctx.ts", additions: 0, deletions: 0, patch: ctxOnlyPatch };
    const api: DiffAnnotationApi = {
      items: [rangeAnnotation({ path: file.path, line: 61, endLine: 63 })],
      markedPaths: new Set([file.path]),
      markerLabel: "Has findings",
      unanchoredTitle: "Findings outside the shown diff",
    };
    render(
      <NextIntlClientProvider locale="en" messages={{ shell }}>
        <FileCard file={file} annotations={api} />
      </NextIntlClientProvider>,
    );

    expect(screen.getAllByText("blocker")).toHaveLength(1);
    expect(screen.getByText("Range finding body")).toBeInTheDocument();
  });

  it("falls back to unanchored when no line of the range is rendered", () => {
    const file: PrFile = { path: "src/off.ts", additions: 0, deletions: 0, patch: null };
    const api: DiffAnnotationApi = {
      items: [rangeAnnotation({ path: file.path, line: 200, endLine: 210, content: <div>Off-range finding</div> })],
      markedPaths: new Set([file.path]),
      markerLabel: "Has findings",
      unanchoredTitle: "Findings outside the shown diff",
    };
    render(
      <NextIntlClientProvider locale="en" messages={{ shell }}>
        <FileCard file={file} annotations={api} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Findings outside the shown diff")).toBeInTheDocument();
    expect(screen.getByText("Off-range finding")).toBeInTheDocument();
  });
});
