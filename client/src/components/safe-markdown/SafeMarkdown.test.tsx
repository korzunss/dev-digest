import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SafeMarkdown } from "./SafeMarkdown";

/* TC11 — AC-34: model text never loads a remote picture. The renderer refuses
   the `img` element itself, so every image form is covered, including the ones a
   text stripper can miss (a shortcut `![x]` whose definition sits on a later line,
   or inside a block quote). */
const PIXEL = "https://tracker.evil.test/p.gif?u=1";

function expectNoImage() {
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.queryByAltText("x")).not.toBeInTheDocument();
}

describe("SafeMarkdown", () => {
  it.each([
    ["an inline image", `Before ![x](${PIXEL}) after`],
    ["a reference image", `Before ![x][r] after\n\n[r]: ${PIXEL}`],
    ["a shortcut image with the URL on the next line", `Before ![x] after\n\n[x]:\n${PIXEL}`],
    ["a shortcut image in a block quote", `> ![x]\n> [x]: ${PIXEL}`],
    ["a raw <img> tag", `Before <img src="${PIXEL}" alt="x"> after`],
  ])("renders no image for %s", (_name, md) => {
    render(<SafeMarkdown>{md}</SafeMarkdown>);
    expectNoImage();
    // nothing on the page loads a resource: no element carries a `src`
    expect(document.body.querySelector("[src]")).toBeNull();
  });

  it("still renders ordinary text, emphasis, code and links", () => {
    render(<SafeMarkdown>{"Hello **bold** and `code`, see [docs](https://example.test)."}</SafeMarkdown>);
    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(screen.getByText("code")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute("href", "https://example.test");
  });
});
