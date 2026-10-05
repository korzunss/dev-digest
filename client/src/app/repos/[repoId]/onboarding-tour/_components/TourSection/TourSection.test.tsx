/* TourSection — collapsible frame (spec 009 AC-29). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TourSection } from "./TourSection";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TourSection", () => {
  // AC-29: starts expanded, the control collapses and re-expands the body
  it("AC-29: starts expanded and the collapse control toggles the body", () => {
    render(
      <TourSection id="tour-x" icon="Workflow" title="Architecture">
        <p>section body</p>
      </TourSection>,
    );
    const toggle = screen.getByRole("button", { name: "Architecture" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("section body")).toBeVisible();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("section body")).not.toBeVisible();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("section body")).toBeVisible();
  });

  // AC-29: collapsed state is not persisted — a fresh mount is expanded and nothing is written to storage
  it("AC-29: a collapsed section is expanded again on a new mount and writes no storage", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { getItem: () => null, setItem, removeItem: vi.fn() });
    vi.stubGlobal("sessionStorage", { getItem: () => null, setItem, removeItem: vi.fn() });
    const first = render(
      <TourSection id="tour-x" icon="Workflow" title="Architecture">
        <p>section body</p>
      </TourSection>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Architecture" }));
    expect(screen.getByRole("button", { name: "Architecture" })).toHaveAttribute("aria-expanded", "false");
    first.unmount();

    render(
      <TourSection id="tour-x" icon="Workflow" title="Architecture">
        <p>section body</p>
      </TourSection>,
    );
    expect(screen.getByRole("button", { name: "Architecture" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("section body")).toBeVisible();
    expect(setItem).not.toHaveBeenCalled();
  });
});
