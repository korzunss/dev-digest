import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";
import { useUnsavedGuard } from "./use-unsaved-guard";

function addLink(href: string): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = href;
  document.body.appendChild(a);
  return a;
}

function click(a: HTMLAnchorElement, init: MouseEventInit = {}): MouseEvent {
  const ev = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
  a.dispatchEvent(ev);
  return ev;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useUnsavedGuard", () => {
  it("blocks a same-origin link to another page when the user declines", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderHook(() => useUnsavedGuard(true, "Leave?"));
    const ev = click(addLink("/agents/other"));
    expect(confirm).toHaveBeenCalledWith("Leave?");
    expect(ev.defaultPrevented).toBe(true);
  });

  it("lets the link through when the user confirms", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderHook(() => useUnsavedGuard(true, "Leave?"));
    const ev = click(addLink("/agents/other"));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("does not prompt for a click that opens a new tab (modifier or middle button)", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderHook(() => useUnsavedGuard(true, "Leave?"));
    const a = addLink("/agents/other");
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      expect(click(a, init).defaultPrevented).toBe(false);
    }
    expect(confirm).not.toHaveBeenCalled();
  });

  it("does nothing while not dirty", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderHook(() => useUnsavedGuard(false, "Leave?"));
    const ev = click(addLink("/agents/other"));
    expect(confirm).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
  });

  it("prevents beforeunload while dirty", () => {
    renderHook(() => useUnsavedGuard(true, "Leave?"));
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });
});
