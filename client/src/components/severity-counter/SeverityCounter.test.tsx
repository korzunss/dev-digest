/**
 * SeverityCounter — the three states that must never look alike (never
 * reviewed / reviewed-and-clean / actual counts), and the click contract the
 * PR-list row depends on: select the level, and do NOT let the row see the
 * click.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";
import { SeverityCounter } from "./SeverityCounter";

afterEach(cleanup);

function renderCounter(props: React.ComponentProps<typeof SeverityCounter>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SeverityCounter {...props} />
    </NextIntlClientProvider>,
  );
}

const counts = { critical: 2, warning: 1, suggestion: 0 };

describe("SeverityCounter — what it shows", () => {
  it("shows an em dash for a PR that was never reviewed", () => {
    renderCounter({ counts: null });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows 0 — not an em dash — for a review that found nothing", () => {
    renderCounter({ counts: { critical: 0, warning: 0, suggestion: 0 } });
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("renders no chip for a level at zero", () => {
    renderCounter({ counts, onSelect: () => {} });
    expect(screen.getByLabelText(/2 critical/)).toBeInTheDocument();
    expect(screen.getByLabelText(/1 warning/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/suggestion/)).not.toBeInTheDocument();
  });

  it("is static without onSelect — nothing is a button", () => {
    renderCounter({ counts });
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByTitle("2 critical")).toBeInTheDocument();
  });
});

describe("SeverityCounter — interaction", () => {
  it("reports the level that was clicked", () => {
    const onSelect = vi.fn();
    renderCounter({ counts, onSelect });
    fireEvent.click(screen.getByLabelText(/1 warning/));
    expect(onSelect).toHaveBeenCalledWith("WARNING");
  });

  it("does not let the click reach the surrounding row", () => {
    // The PR-list row navigates on click; a chip must not trigger that too.
    const onRow = vi.fn();
    const onSelect = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <div onClick={onRow}>
          <SeverityCounter counts={counts} onSelect={onSelect} />
        </div>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByLabelText(/2 critical/));
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");
    expect(onRow).not.toHaveBeenCalled();
  });

  it("marks the active level pressed, and only that one", () => {
    renderCounter({ counts, active: "WARNING", onSelect: () => {} });
    expect(screen.getByLabelText(/1 warning/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(/2 critical/)).toHaveAttribute("aria-pressed", "false");
  });
});
