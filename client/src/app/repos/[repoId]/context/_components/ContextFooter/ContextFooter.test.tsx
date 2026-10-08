/* ContextFooter — count, token sum and last sync. */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/context.json";
import { ContextFooter } from "./ContextFooter";
import { formatSync } from "./helpers";

afterEach(cleanup);

function renderFooter(lastSync: string | null) {
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextFooter count={3} tokens={1200} lastSync={lastSync} />
    </NextIntlClientProvider>,
  );
}

describe("ContextFooter", () => {
  it("shows the document count, the token sum and the last sync", () => {
    const iso = "2026-10-05T10:00:00.000Z";
    renderFooter(iso);
    expect(screen.getByText("3 documents")).toBeInTheDocument();
    expect(screen.getByText("≈ 1200 tokens")).toBeInTheDocument();
    expect(screen.getByText(`Last sync ${formatSync(iso, "en")}`)).toBeInTheDocument();
  });

  it("says so when the repo never synced", () => {
    renderFooter(null);
    expect(screen.getByText("Never synced")).toBeInTheDocument();
  });
});
