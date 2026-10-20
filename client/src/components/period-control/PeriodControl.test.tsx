import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/agentPerformance.json";
import type { PeriodSel } from "@/lib/period";
import { PeriodControl } from "./PeriodControl";

/** AC-1: three periods. AC-4: an invalid custom range is rejected inline and nothing changes. */

afterEach(cleanup);

function setup(value: PeriodSel = { period: "30d" }) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
      <PeriodControl value={value} onChange={onChange} today="2026-10-19" />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Period/ }));
  return onChange;
}

describe("PeriodControl", () => {
  it("offers the three periods and applies a preset at once", () => {
    const onChange = setup();
    expect(screen.getAllByRole("menuitemradio").map((e) => e.textContent)).toEqual(["1 day", "30 days", "Custom"]);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "1 day" }));
    expect(onChange).toHaveBeenCalledWith({ period: "1d" });
  });

  it("rejects a future end date with an inline message and keeps the selection", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Custom" }));
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-25" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("alert")).toHaveTextContent("cannot be in the future");
    expect(screen.getByLabelText("To")).toHaveAttribute("aria-describedby", screen.getByRole("alert").id);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("rejects a reversed range and one over 365 days, then accepts a valid one", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Custom" }));
    const from = screen.getByLabelText("From");
    const to = screen.getByLabelText("To");
    fireEvent.change(from, { target: { value: "2026-10-10" } });
    fireEvent.change(to, { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("alert")).toHaveTextContent("on or before");
    fireEvent.change(from, { target: { value: "2025-01-01" } });
    fireEvent.change(to, { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("alert")).toHaveTextContent("365 days");
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(from, { target: { value: "2026-09-01" } });
    fireEvent.change(to, { target: { value: "2026-09-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onChange).toHaveBeenCalledWith({ period: "custom", from: "2026-09-01", to: "2026-09-30" });
  });
});
