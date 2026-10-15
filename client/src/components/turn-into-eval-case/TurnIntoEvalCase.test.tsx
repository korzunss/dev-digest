/* TurnIntoEvalCase — the action on a finding card: disabled until decided
   (AC-9), a draft or an existing case opens the modal (AC-10, AC-16), a
   refusal is a visible toast and no modal (AC-14, AC-15). The hooks are real;
   the network edge (`api`) is stubbed. EvalCaseModal has its own tests, so it
   is stood in for by a marker. No `@testing-library/user-event` here. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord } from "@devdigest/shared";
import evalMessages from "../../../messages/en/eval.json";

const get = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p) },
}));
vi.mock("@/components/eval-case-modal", () => ({
  EvalCaseModal: (p: { owner: { kind: string; agentId?: string }; draft?: { name: string } | null; existing?: { name: string } | null; onClose: () => void }) => (
    <div role="dialog">
      modal {p.owner.agentId} {p.draft ? `draft:${p.draft.name}` : `existing:${p.existing?.name}`}
      <button onClick={p.onClose}>close-modal</button>
    </div>
  ),
}));

import { ApiError } from "@/lib/api";
import { ToastProvider } from "@/lib/toast";
import { TurnIntoEvalCase } from "./TurnIntoEvalCase";

afterEach(() => {
  cleanup();
  get.mockReset();
});

const finding = (over: Partial<FindingRecord> = {}): FindingRecord =>
  ({
    id: "f1", severity: "CRITICAL", category: "security", title: "Leaked key", file: "src/config.ts",
    start_line: 11, end_line: 11, rationale: "r", suggestion: null, confidence: 0.9, kind: "finding",
    trifecta_components: null, evidence: null, review_id: "r1", accepted_at: null, dismissed_at: null,
    ...over,
  }) as FindingRecord;

function renderAction(f: FindingRecord) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      <ToastProvider>
        <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
          <TurnIntoEvalCase finding={f} />
        </NextIntlClientProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const DRAFT = { kind: "draft", draft: { agent_id: "a1", name: "must-find-leaked-key" } };

describe("TurnIntoEvalCase", () => {
  it("is disabled with a tooltip while the finding is undecided, and asks nothing", () => {
    renderAction(finding());
    const btn = screen.getByRole("button", { name: "Turn into eval case" });
    expect(btn).toBeDisabled();
    expect(screen.getByTitle("Accept or dismiss this finding first")).toBeInTheDocument();
    fireEvent.click(btn);
    expect(get).not.toHaveBeenCalled();
  });

  it("opens an unsaved draft for the producing agent, then closes it", async () => {
    get.mockResolvedValue(DRAFT);
    renderAction(finding({ accepted_at: "2026-10-12T00:00:00Z" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(await screen.findByText(/modal a1 draft:must-find-leaked-key/)).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/findings/f1/eval-draft");
    fireEvent.click(screen.getByText("close-modal"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the saved case in edit mode when one exists (AC-16)", async () => {
    get.mockResolvedValue({ kind: "existing", case: { id: "c1", agent_id: "a1", name: "saved-case" } });
    renderAction(finding({ dismissed_at: "2026-10-12T00:00:00Z" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(await screen.findByText(/existing:saved-case/)).toBeInTheDocument();
  });

  it("shows the refusal as a toast and opens no modal (AC-14, AC-15)", async () => {
    get.mockRejectedValueOnce(new ApiError("no diff text available for src/config.ts", 422, "no_diff_text"));
    renderAction(finding({ accepted_at: "2026-10-12T00:00:00Z" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(await screen.findByText("No diff text available for src/config.ts")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();

    get.mockRejectedValueOnce(new ApiError("gone", 409, "agent_missing"));
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    await waitFor(() =>
      expect(screen.getByText("The agent that produced this finding no longer exists")).toBeInTheDocument(),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
