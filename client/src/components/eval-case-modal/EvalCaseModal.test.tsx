/* EvalCaseModal — the flows a reviewer actually walks: open a seeded draft,
   run it, edit, save, close. Hooks are REAL; the network edge (`api`) is
   stubbed, so the assertions are about what is sent and shown. No
   `@testing-library/user-event` in this package (client/INSIGHTS.md). */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCaseResult, EvalDraft, EvalSuiteCase } from "@devdigest/shared";
import evalMessages from "../../../messages/en/eval.json";
import common from "../../../messages/en/common.json";
import shell from "../../../messages/en/shell.json";

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: {
    get: (p: string) => get(p),
    post: (p: string, b?: unknown) => post(p, b),
    put: (p: string, b?: unknown) => put(p, b),
  },
}));
const toastSuccess = vi.fn();
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: toastSuccess, error: vi.fn(), info: vi.fn(), toast: vi.fn() }) }));

import { ApiError } from "@/lib/api";
import { EvalCaseModal } from "./EvalCaseModal";

const DIFF = ["diff --git a/src/a.ts b/src/a.ts", "--- a/src/a.ts", "+++ b/src/a.ts", "@@ -1,2 +1,3 @@", " keep", "+leak", "+more"].join("\n");

function draft(over: Partial<EvalDraft> = {}): EvalDraft {
  return {
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openai",
    model: "gpt-x",
    name: "must-find-leaked-key",
    input: { diff: DIFF, files: ["src/a.ts"], pr_meta: { repo_id: "r1", repo: "acme/api", pr_number: 7, title: "Add billing", head_sha: "abc123" } },
    expected: [{ expect: "must_find", file: "src/a.ts", start_line: 2, end_line: 3, title: "Leaked key", severity: "CRITICAL", category: "secrets" }],
    source: { finding_id: "f1", pr_id: "p1", repo_id: "r1", pr_number: 7 },
    seeded_from: "accepted",
    ...over,
  } as EvalDraft;
}

const RESULT: EvalCaseResult = {
  status: "passed", expected_count: 1, actual_count: 1, must_find_total: 1, must_find_matched: 1, noise: 0, kept: 1, dropped: 0,
  duration_ms: 1200, cost_usd: 0.0042, error: null, ran_at: "2026-10-12T10:00:00Z", agent_version: 3, findings: [],
};

function savedCase(over: Partial<EvalSuiteCase> = {}): EvalSuiteCase {
  const d = draft();
  return {
    id: "c1", agent_id: "a1", name: d.name, input: d.input, expected: d.expected, source: d.source,
    created_at: "2026-10-12T09:00:00Z", updated_at: "2026-10-12T09:00:00Z", last_result: null, ...over,
  } as EvalSuiteCase;
}

const onClose = vi.fn();
const onOpenExisting = vi.fn();

function renderModal(props: Partial<React.ComponentProps<typeof EvalCaseModal>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common, shell }}>
        <EvalCaseModal agentId="a1" onClose={onClose} onOpenExisting={onOpenExisting} {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const expectedBox = () => screen.getByLabelText("Expected output") as HTMLTextAreaElement;
const clickLast = (name: string) => {
  const dialogs = screen.getAllByRole("dialog");
  fireEvent.click(within(dialogs[dialogs.length - 1]!).getByRole("button", { name }));
};

beforeEach(() => {
  get.mockImplementation(async (p: string) => {
    if (p === "/agents/a1") return { id: "a1", name: "Security Reviewer", model: "gpt-x" };
    throw new Error(`unexpected GET ${p}`);
  });
});
afterEach(() => {
  cleanup();
  for (const m of [get, post, put, toastSuccess, onClose, onOpenExisting]) m.mockReset();
});

describe("EvalCaseModal — a draft seeded from a finding", () => {
  it("shows the title, subtitle, type banner and the three input tabs with the source links", () => {
    renderModal({ draft: draft() });
    expect(screen.getByText("Eval case · must-find-leaked-key")).toBeInTheDocument();
    expect(screen.getByText("Seeded from an accepted finding · assert the expected output")).toBeInTheDocument();
    expect(screen.getByText('POSITIVE CASE · MUST find "Leaked key" at src/a.ts:2-3')).toBeInTheDocument();
    expect((screen.getByLabelText("Unified diff") as HTMLTextAreaElement).value).toBe(DIFF);
    expect(screen.getByText("valid JSON")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Files" }));
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "PR meta" }));
    expect(screen.getByText("Title: Add billing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open source PR" })).toHaveAttribute("href", "/repos/r1/pulls/7");
    expect(screen.getByRole("link", { name: "Open source finding" })).toHaveAttribute("href", "/repos/r1/pulls/7#finding-f1");
  });

  it("builds a negative banner for a dismissed finding", () => {
    renderModal({
      draft: draft({
        seeded_from: "dismissed",
        expected: [{ expect: "must_not_flag", file: "src/a.ts", start_line: 2, title: "Noise" }],
      }),
    });
    expect(screen.getByText("Seeded from a dismissed finding · assert the expected output")).toBeInTheDocument();
    expect(screen.getByText('NEGATIVE CASE · MUST NOT flag "Noise" at src/a.ts:2')).toBeInTheDocument();
  });

  it("confirms with the model, runs the draft, shows the result and marks it stale after an edit", async () => {
    post.mockResolvedValue({ result: RESULT, run_token: "tok1" });
    renderModal({ draft: draft() });
    await screen.findByText("valid JSON");
    fireEvent.click(screen.getByRole("button", { name: "Run case" }));
    await screen.findByText(/with gpt-x/);
    expect(post).not.toHaveBeenCalled();
    clickLast("Run");

    await screen.findByText("Last run passed");
    expect(screen.getByText("expected 1, got 1 · 1.2s · $0.0042")).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/agents/a1/eval-draft-runs", {
      input: { diff: DIFF, pr_meta: draft().input.pr_meta },
      expected_output: draft().expected,
    });
    expect(screen.queryByText("edited since last run")).not.toBeInTheDocument();

    fireEvent.change(expectedBox(), { target: { value: "[]" } });
    expect(screen.getByText("edited since last run")).toBeInTheDocument();
  });

  it("appends a Finding skeleton to the expected output", () => {
    renderModal({ draft: draft() });
    fireEvent.click(screen.getByRole("button", { name: "Finding skeleton" }));
    const parsed = JSON.parse(expectedBox().value);
    expect(parsed).toHaveLength(2);
    expect(parsed[1]).toMatchObject({ expect: "must_find", file: "src/a.ts" });
  });

  it("refuses a save with invalid JSON before any request, then saves with the source and run token", async () => {
    post.mockImplementation(async (p: string) => {
      if (p.endsWith("/eval-draft-runs")) return { result: RESULT, run_token: "tok1" };
      return savedCase();
    });
    renderModal({ draft: draft() });
    fireEvent.change(expectedBox(), { target: { value: "[oops" } });
    // AC-23: the indicator itself turns into the parse error.
    expect(screen.getAllByRole("status").some((el) => /invalid JSON/.test(el.textContent ?? ""))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid JSON/);
    expect(post).not.toHaveBeenCalled();

    fireEvent.change(expectedBox(), { target: { value: JSON.stringify(draft().expected) } });
    fireEvent.click(screen.getByRole("button", { name: "Run case" }));
    await screen.findByText(/with gpt-x/);
    clickLast("Run");
    await screen.findByText("Last run passed");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Saved must-find-leaked-key (must find)"));
    const saveCall = post.mock.calls.find(([p]) => p === "/agents/a1/eval-cases");
    expect(saveCall![1]).toMatchObject({ name: "must-find-leaked-key", source_finding_id: "f1", draft_run_token: "tok1" });
    expect(screen.getByRole("link", { name: "Open case" })).toHaveAttribute("href", "/agents/a1?tab=evals");
  });

  it("omits the run token when the run is stale", async () => {
    post.mockImplementation(async (p: string) => (p.endsWith("/eval-draft-runs") ? { result: RESULT, run_token: "tok1" } : savedCase()));
    renderModal({ draft: draft() });
    fireEvent.click(screen.getByRole("button", { name: "Run case" }));
    await screen.findByText(/with gpt-x/);
    clickLast("Run");
    await screen.findByText("Last run passed");
    fireEvent.change(screen.getByLabelText("Unified diff"), { target: { value: `${DIFF}\n+extra` } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const body = post.mock.calls.find(([p]) => p === "/agents/a1/eval-cases")![1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("draft_run_token");
  });

  it("shows the server's reason on a refused save and offers the existing case on case_exists", async () => {
    post.mockRejectedValueOnce(
      new ApiError("expectation 0 (src/b.ts:1-1): file not in diff", 422, "validation_error", [
        { index: 0, field: "expected_output", message: "expectation 0 (src/b.ts:1-1): file not in diff" },
      ]),
    );
    renderModal({ draft: draft() });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("expectation 0 (src/b.ts:1-1): file not in diff");
    expect(toastSuccess).not.toHaveBeenCalled();

    post.mockRejectedValueOnce(new ApiError("a case for this finding exists", 409, "case_exists", { case_id: "c9" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open existing case" }));
    expect(onOpenExisting).toHaveBeenCalledWith("c9");
  });

  it("states a missing API key as the run's reason", async () => {
    post.mockRejectedValueOnce(new ApiError("no API key for openai", 422, "no_api_key", null));
    renderModal({ draft: draft() });
    fireEvent.click(screen.getByRole("button", { name: "Run case" }));
    await screen.findByText(/with gpt-x/);
    clickLast("Run");
    expect(await screen.findByRole("alert")).toHaveTextContent("no API key for openai");
  });
});

describe("EvalCaseModal — closing", () => {
  it("closes a pristine draft silently", () => {
    renderModal({ draft: draft() });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Discard draft?")).not.toBeInTheDocument();
  });

  it("asks 'Discard draft?' once edited, keeps the draft on cancel and discards on confirm", () => {
    renderModal({ draft: draft() });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "renamed" } });
    fireEvent.click(screen.getByLabelText("Close"));
    expect(screen.getByText("Discard draft?")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    clickLast("Cancel");
    expect(screen.queryByText("Discard draft?")).not.toBeInTheDocument();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("renamed");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    clickLast("Discard");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks 'Discard changes?' only when a saved case was edited", () => {
    renderModal({ existing: savedCase({ last_result: RESULT }) });
    expect(screen.getByText("Last run passed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "other" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("EvalCaseModal — a new hand-written case", () => {
  it("opens empty with PR meta 'none', refuses an empty name and saves through the update path when editing", async () => {
    renderModal();
    expect(screen.getByText("New eval case")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "PR meta" }));
    expect(screen.getByText("none")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Name is required");
    expect(post).not.toHaveBeenCalled();
  });

  it("PUTs an edited saved case", async () => {
    put.mockResolvedValue(savedCase({ name: "other" }));
    renderModal({ existing: savedCase() });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "other" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Saved other (must find)"));
    expect(put).toHaveBeenCalledWith("/eval-cases/c1", expect.objectContaining({ name: "other" }));
    expect(put.mock.calls[0]![1]).not.toHaveProperty("source_finding_id");
  });
});
