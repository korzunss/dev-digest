/* ArchitectureSection — body, chips, structure and the one diagram (spec 009 AC-17, AC-34, AC-35).
   `mermaid` (lazy-imported by MermaidDiagram) is the outside world and is stubbed. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import type { OnboardingTour } from "@devdigest/shared";

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(),
  render: vi.fn(),
}));
vi.mock("mermaid", () => ({ default: mermaid }));

import { ArchitectureSection } from "./ArchitectureSection";

const arch = (over: Partial<OnboardingTour["architecture"]> = {}): OnboardingTour["architecture"] => ({
  availability: { available: true, cause: null, reason: null },
  body: "A layered Fastify API.",
  diagram: null,
  stack: ["TypeScript", "Fastify"],
  structure: ["server/ — API", "client/ — studio"],
  ...over,
});

const DIAGRAM = "flowchart TD\n  A[client] --> B[server]";

beforeEach(() => {
  mermaid.parse.mockReset().mockResolvedValue(true);
  mermaid.render.mockReset().mockResolvedValue({ svg: '<svg role="img" aria-label="architecture diagram"></svg>' });
  mermaid.initialize.mockReset();
});
afterEach(cleanup);

describe("ArchitectureSection", () => {
  // AC-35: the diagram is rendered in the box style from the section's own mermaid source
  it("AC-35: renders the section's mermaid diagram with the boxes theme", async () => {
    render(<ArchitectureSection architecture={arch({ diagram: DIAGRAM })} />);
    expect(await screen.findByRole("img", { name: "architecture diagram" })).toBeInTheDocument();
    expect(mermaid.render).toHaveBeenCalledWith(expect.any(String), DIAGRAM);
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ theme: "base", securityLevel: "strict" }),
    );
  });

  // AC-35: a section without a diagram renders none and never calls mermaid
  it("AC-35: renders no diagram when the section has none", async () => {
    render(<ArchitectureSection architecture={arch({ diagram: null })} />);
    expect(screen.getByText("A layered Fastify API.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  // AC-17: an unrenderable diagram is dropped, the text stays
  it("AC-17: drops a diagram mermaid cannot parse and keeps the section text", async () => {
    mermaid.parse.mockResolvedValue(false);
    render(<ArchitectureSection architecture={arch({ diagram: DIAGRAM })} />);
    await waitFor(() => expect(mermaid.parse).toHaveBeenCalled());
    expect(mermaid.render).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("A layered Fastify API.")).toBeInTheDocument();
    expect(screen.getByText("Fastify")).toBeInTheDocument();
    expect(screen.getByText("server/ — API")).toBeInTheDocument();
  });

  // AC-17: a render-time throw is also dropped, not surfaced
  it("AC-17: drops a diagram whose render throws and keeps the text", async () => {
    mermaid.render.mockRejectedValue(new Error("boom"));
    render(<ArchitectureSection architecture={arch({ diagram: DIAGRAM })} />);
    await waitFor(() => expect(mermaid.render).toHaveBeenCalled());
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("A layered Fastify API.")).toBeInTheDocument();
  });

  // AC-17: prose that is not a diagram never reaches mermaid
  it("AC-17: does not send non-diagram text to mermaid", async () => {
    render(<ArchitectureSection architecture={arch({ diagram: "just some prose" })} />);
    expect(screen.getByText("A layered Fastify API.")).toBeInTheDocument();
    expect(mermaid.parse).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  // AC-34: raw HTML in the body is not rendered as elements
  it("AC-34: renders no script, iframe or HTML element from the body", () => {
    const { container } = render(
      <ArchitectureSection
        architecture={arch({
          body: 'Intro **bold**\n\n<script>alert(1)</script>\n\n<iframe src="https://evil.example"></iframe>\n\n<img src=x onerror="alert(2)">',
        })}
      />,
    );
    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
  });

  // AC-34: Markdown image syntax must not load a remote image
  it("AC-34: renders no <img> for Markdown image syntax in the body", () => {
    const { container } = render(
      <ArchitectureSection architecture={arch({ body: "See ![pixel](https://tracker.example/p.png) above" })} />,
    );
    expect(screen.getByText(/See/)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
