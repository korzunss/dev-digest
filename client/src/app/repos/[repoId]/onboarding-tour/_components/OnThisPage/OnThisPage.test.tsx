/* OnThisPage — section index with scroll-spy (spec 009 AC-28). IntersectionObserver is stubbed. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import { OnThisPage } from "./OnThisPage";

type IOCallback = (entries: Array<{ isIntersecting: boolean; target: { id: string } }>) => void;
let callback: IOCallback | null = null;
const observed: string[] = [];
const disconnect = vi.fn();

class FakeIntersectionObserver {
  constructor(cb: IOCallback) {
    callback = cb;
  }
  observe(el: Element) {
    observed.push(el.id);
  }
  unobserve() {}
  disconnect() {
    disconnect();
  }
}

const ITEMS = [
  { id: "tour-architecture", label: "Architecture" },
  { id: "tour-critical-paths", label: "Critical paths" },
];

function renderIndex() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      {ITEMS.map((i) => (
        <section key={i.id} id={i.id} />
      ))}
      <OnThisPage items={ITEMS} />
    </NextIntlClientProvider>,
  );
}

const scrollIntoView = vi.fn();

beforeEach(() => {
  callback = null;
  observed.length = 0;
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  scrollIntoView.mockReset();
  disconnect.mockReset();
});

describe("OnThisPage", () => {
  // AC-28: selecting an entry brings exactly that section into view
  it("AC-28: clicking an entry scrolls that section into view", () => {
    renderIndex();
    const nav = screen.getByRole("navigation", { name: onboarding.onThisPage });
    expect(nav).toBeInTheDocument();
    scrollIntoView.mockClear();
    fireEvent.click(screen.getByRole("link", { name: "Critical paths" }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById("tour-critical-paths"));
  });

  // AC-28: while scrolling, the entry for the section in view is highlighted (only one)
  it("AC-28: highlights the section currently in view and moves the highlight as it changes", () => {
    renderIndex();
    expect(observed).toEqual(ITEMS.map((i) => i.id));
    expect(screen.getByRole("link", { name: "Architecture" })).not.toHaveAttribute("aria-current");

    act(() => callback!([{ isIntersecting: true, target: { id: "tour-architecture" } }]));
    expect(screen.getByRole("link", { name: "Architecture" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Critical paths" })).not.toHaveAttribute("aria-current");

    act(() =>
      callback!([
        { isIntersecting: false, target: { id: "tour-architecture" } },
        { isIntersecting: true, target: { id: "tour-critical-paths" } },
      ]),
    );
    expect(screen.getByRole("link", { name: "Critical paths" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Architecture" })).not.toHaveAttribute("aria-current");
  });

  // the observer must not leak after the page unmounts
  it("AC-28: disconnects the observer on unmount", () => {
    const view = renderIndex();
    expect(disconnect).not.toHaveBeenCalled();
    view.unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
