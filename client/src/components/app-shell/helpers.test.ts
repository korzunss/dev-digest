/* Sidebar wiring for the Onboarding Tour (spec 009 AC-1..3). Pure data + pure function. */
import { describe, it, expect } from "vitest";
import { NAV } from "@devdigest/ui";
import { activeKeyFor } from "./helpers";

const workspace = () => NAV.find((g) => g.section === "WORKSPACE")!;

describe("Onboarding Tour navigation", () => {
  // AC-1: WORKSPACE order is Pull Requests, Onboarding Tour, Project Context
  it("AC-1: lists Onboarding Tour between Pull Requests and Project Context", () => {
    const keys = workspace().items.map((i) => i.key);
    expect(keys.slice(0, 3)).toEqual(["pulls", "onboarding-tour", "context"]);
    const item = workspace().items.find((i) => i.key === "onboarding-tour")!;
    expect(item.label).toBe("Onboarding Tour");
    expect(item.href).toBe("/repos/:repoId/onboarding-tour");
  });

  // AC-2: the Add-repository page (/onboarding) must not light the tour item
  it("AC-2: the Add-repository page /onboarding is not the tour's active key", () => {
    expect(activeKeyFor("/onboarding")).toBe("");
    expect(activeKeyFor("/onboarding")).not.toBe("onboarding-tour");
  });

  // AC-3: the repo-scoped tour route is the active item
  it("AC-3: /repos/:id/onboarding-tour activates the tour item", () => {
    expect(activeKeyFor("/repos/r1/onboarding-tour")).toBe("onboarding-tour");
  });
});
