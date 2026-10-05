import { describe, it, expect } from "vitest";
import { stripMarkdownImages } from "./helpers";

describe("stripMarkdownImages", () => {
  it("removes inline images and keeps the surrounding text", () => {
    expect(stripMarkdownImages("a ![pix](https://t.example/p.png) b")).toBe("a  b");
  });
  it("removes inline images with parentheses in the url or a title", () => {
    expect(stripMarkdownImages('x ![a](https://t.example/p_(1).png "t") y')).toBe("x  y");
  });
  it("removes reference images and their definitions", () => {
    const out = stripMarkdownImages("see ![logo][l] now\n\n[l]: https://t.example/l.png");
    expect(out).not.toContain("t.example");
    expect(out).not.toContain("![");
    expect(out).toContain("see");
  });
  it("removes raw <img> tags, any case", () => {
    expect(stripMarkdownImages('a <IMG src="https://t.example/x.png" onerror="x()"> b')).toBe("a  b");
  });
  it("leaves links and plain text untouched", () => {
    const s = "a [link](https://ok.example) and **bold**";
    expect(stripMarkdownImages(s)).toBe(s);
  });
});
