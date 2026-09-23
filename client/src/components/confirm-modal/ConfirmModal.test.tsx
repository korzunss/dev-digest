/**
 * ConfirmModal — the question asked before a destructive action.
 *
 * What is worth guarding is that it offers all three ways out a dialog owes
 * you — confirm, cancel, and a close control — and that only the first of them
 * does anything. `window.confirm`, which this replaced, had no third one.
 *
 * No `@testing-library/user-event` in this package (client/INSIGHTS.md).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "../../../messages/en/common.json";
import { ConfirmModal } from "./ConfirmModal";

const onConfirm = vi.fn();
const onClose = vi.fn();

afterEach(() => {
  cleanup();
  onConfirm.mockReset();
  onClose.mockReset();
});

function renderModal(over: { pending?: boolean } = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ common }}>
      <ConfirmModal
        title="Delete this skill?"
        body="Delete skill no-then-chains? Agents using it lose it."
        confirmLabel="Delete skill"
        onConfirm={onConfirm}
        onClose={onClose}
        {...over}
      />
    </NextIntlClientProvider>,
  );
}

describe("ConfirmModal", () => {
  it("asks the question and offers all three ways out", () => {
    renderModal();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Delete this skill?")).toBeInTheDocument();
    expect(screen.getByText(/no-then-chains/)).toBeInTheDocument();
    expect(screen.getByText("Delete skill")).toBeInTheDocument();
    expect(screen.getByText(common.actions.cancel)).toBeInTheDocument();
    // The close control `window.confirm` never had.
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
  });

  it("does nothing until the destructive button is pressed", () => {
    renderModal();
    fireEvent.click(screen.getByText(common.actions.cancel));
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByText("Delete skill"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("locks both buttons while the delete is in flight", () => {
    // A second press would fire a second DELETE for a row the first one is
    // already removing, and Cancel would leave the request running unobserved.
    renderModal({ pending: true });
    fireEvent.click(screen.getByText(common.actions.cancel));
    expect(onClose).not.toHaveBeenCalled();

    expect(screen.getByText(common.actions.cancel).closest("button")).toBeDisabled();
  });
});
