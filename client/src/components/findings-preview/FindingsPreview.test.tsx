/**
 * FindingsPreview — the hover card over a severity counter. What matters here:
 * it opens on hover AND on focus, it agrees with the counts beside it (dismissed
 * findings absent), it caps long lists, and it tells the caller when to fetch.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../messages/en/prReview.json";
import { FindingsPreview, PREVIEW_LIMIT } from "./FindingsPreview";

afterEach(cleanup);

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key in commit",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "Line 12 contains a literal string starting with sk_live_.",
    suggestion: null,
    confidence: 0.98,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function renderPreview(props: Partial<React.ComponentProps<typeof FindingsPreview>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsPreview scope="pr" findings={[finding({ id: "f1" })]} {...props}>
        <button type="button">counter</button>
      </FindingsPreview>
    </NextIntlClientProvider>,
  );
}

const trigger = () => screen.getByText("counter").parentElement!;

describe("FindingsPreview — opening", () => {
  it("shows nothing until hovered", () => {
    renderPreview();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens on hover and closes on mouse-out", () => {
    renderPreview();
    fireEvent.mouseEnter(trigger());
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.mouseLeave(trigger());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens on keyboard focus too — hover is not the only way in", () => {
    renderPreview();
    fireEvent.focus(screen.getByText("counter"));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    renderPreview();
    fireEvent.mouseEnter(trigger());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("tells the caller when to start (and stop) fetching", () => {
    const onOpenChange = vi.fn();
    renderPreview({ onOpenChange });
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.mouseEnter(trigger());
    expect(onOpenChange).toHaveBeenCalledWith(true);
    fireEvent.mouseLeave(trigger());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("stays shut when there is nothing to preview", () => {
    renderPreview({ findings: [] });
    fireEvent.mouseEnter(trigger());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens on a loading state so the card doesn't pop in late", () => {
    renderPreview({ findings: [], loading: true });
    fireEvent.mouseEnter(trigger());
    expect(screen.getByText("Loading findings…")).toBeInTheDocument();
  });
});

describe("FindingsPreview — contents", () => {
  it("heads with the count and renders the finding's detail", () => {
    renderPreview();
    fireEvent.mouseEnter(trigger());
    expect(screen.getByText("1 findings")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.getByText("98% conf")).toBeInTheDocument();
    expect(screen.getByText(/sk_live_/)).toBeInTheDocument();
  });

  it("names the run in the header when previewing a single run", () => {
    renderPreview({ scope: "run" });
    fireEvent.mouseEnter(trigger());
    expect(screen.getByText("1 findings in this run")).toBeInTheDocument();
  });

  it("excludes dismissed findings — the card and the chips must not disagree", () => {
    renderPreview({
      findings: [
        finding({ id: "f1", title: "Still open" }),
        finding({ id: "f2", title: "Triaged away", dismissed_at: "2026-09-18T00:00:00Z" }),
      ],
    });
    fireEvent.mouseEnter(trigger());
    expect(screen.getByText("1 findings")).toBeInTheDocument();
    expect(screen.queryByText("Triaged away")).not.toBeInTheDocument();
  });

  it("caps the list and counts the remainder instead of growing past the viewport", () => {
    const many = Array.from({ length: PREVIEW_LIMIT + 3 }, (_, i) =>
      finding({ id: `f${i}`, title: `Finding ${i}` }),
    );
    renderPreview({ findings: many });
    fireEvent.mouseEnter(trigger());
    expect(screen.getByText(`${PREVIEW_LIMIT + 3} findings`)).toBeInTheDocument();
    expect(screen.getByText(`Finding ${PREVIEW_LIMIT - 1}`)).toBeInTheDocument();
    expect(screen.queryByText(`Finding ${PREVIEW_LIMIT}`)).not.toBeInTheDocument();
    expect(screen.getByText("+3 more")).toBeInTheDocument();
  });

  it("orders by severity, worst first", () => {
    renderPreview({
      findings: [
        finding({ id: "f1", severity: "SUGGESTION", title: "A suggestion" }),
        finding({ id: "f2", severity: "CRITICAL", title: "A critical" }),
        finding({ id: "f3", severity: "WARNING", title: "A warning" }),
      ],
    });
    fireEvent.mouseEnter(trigger());
    const titles = screen
      .getAllByText(/^A (critical|warning|suggestion)$/)
      .map((el) => el.textContent);
    expect(titles).toEqual(["A critical", "A warning", "A suggestion"]);
  });
});
