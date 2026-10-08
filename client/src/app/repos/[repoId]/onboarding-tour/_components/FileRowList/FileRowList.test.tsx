/* FileRowList — Critical paths / Guided reading path rows (spec 009 AC-5, AC-6, AC-31). */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { OnboardingFileRow } from "@devdigest/shared";
import onboarding from "../../../../../../../messages/en/onboarding.json";
import type { ForgeRepoRef } from "@/lib/forge-urls";
import { FileRowList } from "./FileRowList";

afterEach(cleanup);

const GITHUB: ForgeRepoRef = { provider: "github", api_base: null, full_name: "acme/api" };
const row = (over: Partial<OnboardingFileRow>): OnboardingFileRow => ({
  path: "src/a.ts",
  reason: null,
  rank_position: null,
  importers: null,
  chain: [],
  ...over,
});

function renderList(props: Partial<React.ComponentProps<typeof FileRowList>> & { rows: OnboardingFileRow[] }) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding }}>
      <FileRowList repo={GITHUB} builtSha="abc123" {...props} />
    </NextIntlClientProvider>,
  );
}

describe("FileRowList", () => {
  // AC-5: rows keep the server's order and the reading path is numbered
  it("AC-5: keeps the server's order and numbers the rows when ordered", () => {
    renderList({
      ordered: true,
      rows: [row({ path: "src/z-top.ts" }), row({ path: "src/a-second.ts" }), row({ path: "src/m-third.ts" })],
    });
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector("code")?.textContent)).toEqual([
      "src/z-top.ts",
      "src/a-second.ts",
      "src/m-third.ts",
    ]);
    expect(items[0]).toHaveTextContent("1.");
    expect(items[2]).toHaveTextContent("3.");
    expect(screen.getByRole("list").tagName).toBe("OL");
  });

  // AC-5: skeleton reason is computed from the graph numbers
  it("AC-5: shows the graph-derived reason 'rank #2 · imported by 14 files' when the row has no model reason", () => {
    renderList({ rows: [row({ path: "src/core.ts", rank_position: 2, importers: 14 })] });
    expect(screen.getByText("rank #2 · imported by 14 files")).toBeInTheDocument();
  });

  // AC-6: skeleton critical path reason is the chain the file heads
  it("AC-6: shows 'heads the chain …' from the chain when rank data is absent", () => {
    renderList({ rows: [row({ path: "src/a.ts", chain: ["src/a.ts", "src/b.ts", "src/c.ts"] })] });
    expect(screen.getByText("heads the chain src/a.ts → src/b.ts → src/c.ts")).toBeInTheDocument();
  });

  // the model's own one-line reason wins over the computed wording
  it("AC-5: prefers the row's own reason over the computed one", () => {
    renderList({ rows: [row({ reason: "Entry point of the API", rank_position: 1, importers: 9 })] });
    expect(screen.getByText("Entry point of the API")).toBeInTheDocument();
    expect(screen.queryByText(/imported by/)).not.toBeInTheDocument();
  });

  // AC-31: Open goes to the forge blob at the built commit, in a new tab, without opener access
  it("AC-31: Open links to the file at the built sha in a new tab with noopener", () => {
    renderList({ rows: [row({ path: "src/a b.ts" })] });
    const link = screen.getByRole("link", { name: "Open src/a b.ts" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/api/blob/abc123/src/a%20b.ts");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  // AC-31: a self-managed GitLab base URL and path prefix are honoured
  it("AC-31: honours a self-managed GitLab base with a path prefix", () => {
    renderList({
      repo: { provider: "gitlab", api_base: "https://git.corp.example/gl/", full_name: "grp/proj" },
      rows: [row({ path: "src/a.ts" })],
    });
    expect(screen.getByRole("link", { name: "Open src/a.ts" })).toHaveAttribute(
      "href",
      "https://git.corp.example/gl/grp/proj/-/blob/abc123/src/a.ts",
    );
  });

  // AC-31: with no built commit there is no stable blob, so no Open link is offered
  it("AC-31: offers no Open link when the tour has no built sha", () => {
    renderList({ builtSha: null, rows: [row({ path: "src/a.ts" })] });
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
