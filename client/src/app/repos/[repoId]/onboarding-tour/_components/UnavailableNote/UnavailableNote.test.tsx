/* UnavailableNote — "not available" stand-in (spec 009 AC-7, AC-8, AC-37). The network edge (`api`) is stubbed. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OnboardingAvailability } from "@devdigest/shared";
import onboarding from "../../../../../../../messages/en/onboarding.json";

const post = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { post: (p: string) => post(p) },
}));

import { UnavailableNote } from "./UnavailableNote";

function renderNote(availability: OnboardingAvailability) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ onboarding }}>
        <UnavailableNote availability={availability} repoId="r1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => post.mockReset().mockResolvedValue({ status: "queued" }));
afterEach(cleanup);

describe("UnavailableNote", () => {
  // AC-7: non-JS/TS repo — the cause names the language, and there is no re-sync that could help
  it("AC-7: names 'languages are not indexed' and offers no re-sync or settings step", () => {
    renderNote({ available: false, cause: "language_not_indexed", reason: null });
    expect(screen.getByRole("status")).toHaveTextContent(onboarding.unavailable.language_not_indexed);
    expect(screen.queryByRole("button", { name: "Re-sync index" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  // AC-8 + AC-37: index failure shows cause, the mapped reason, and a working Re-sync next step
  it("AC-8/AC-37: an index failure names the cause and reason and Re-sync posts to the repo's resync", async () => {
    renderNote({ available: false, cause: "index_failed", reason: "index_failed" });
    expect(screen.getByText(onboarding.unavailable.index_failed)).toBeInTheDocument();
    expect(screen.getByText(onboarding.indexReason.index_failed)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Re-sync index" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/repos/r1/resync"));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  // AC-8: a reason code the client does not know falls back to the generic wording, not a raw code
  it("AC-8: an unknown index reason code falls back to the generic wording", () => {
    renderNote({ available: false, cause: "index_failed", reason: "some_new_code" });
    expect(screen.getByText(onboarding.indexReason.other)).toBeInTheDocument();
    expect(screen.queryByText("some_new_code")).not.toBeInTheDocument();
  });

  // AC-37: a model cause the user fixes in Settings → Models links there
  it("AC-37: a missing-key model failure names the cause and links to model settings, with no Re-sync", () => {
    renderNote({ available: false, cause: "model_failed", reason: "no_key" });
    expect(screen.getByText(onboarding.unavailable.model_failed)).toBeInTheDocument();
    expect(screen.getByText(onboarding.failure.no_key)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open model settings" })).toHaveAttribute("href", "/settings/models");
    expect(screen.queryByRole("button", { name: "Re-sync index" })).not.toBeInTheDocument();
  });

  // AC-37: "where one applies" — a timeout is not fixed in settings, so no link
  it("AC-37: a timeout model failure offers no settings link", () => {
    renderNote({ available: false, cause: "model_failed", reason: "timeout" });
    expect(screen.getByText(onboarding.failure.timeout)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
