/* CompareRunsModal — what a reviewer reads when comparing two runs (metric
   deltas, prompt diff, skill difference) and how a confirmed promote goes.
   Hooks are REAL; the network edge (`api`) is stubbed. No
   `@testing-library/user-event` in this package. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCompare, EvalSuiteRun } from "@devdigest/shared";
import evalMessages from "../../../../../../messages/en/eval.json";
import common from "../../../../../../messages/en/common.json";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p), post: (p: string, b?: unknown) => post(p, b) },
}));
const toastSuccess = vi.fn();
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: toastSuccess, error: vi.fn(), info: vi.fn(), toast: vi.fn() }) }));

import { ApiError } from "@/lib/api";
import { CompareRunsModal } from "./CompareRunsModal";

const run = (id: string, v: number, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun => ({
  id, agent_id: "a1", agent_name: "Security Reviewer", agent_version: v, provider: "openai", model: "gpt-x", skills: [],
  status: "completed", started_at: "2026-05-29T09:14:00Z", finished_at: null, cases_total: 20, cases_done: 20,
  cases_passed: 17, cases_errored: 0, metrics: { recall: 0.82, precision: 0.91, citation_accuracy: 0.95 }, cost_usd: 0.23, ...over,
});

const CMP: EvalCompare = {
  older: run("r6", 6, { metrics: { recall: 0.78, precision: 0.93, citation_accuracy: 0.94 }, cost_usd: 0.21 }),
  newer: run("r7", 7),
  deltas: { recall: 0.04, precision: -0.02, citation_accuracy: 0.01, cost_usd: 0.02 },
  same_version: false,
  prompt_diff: [
    { op: "same", text: "You are a security reviewer." },
    { op: "del", text: "Return at most 3 findings." },
    { op: "add", text: "<b>Flag unused imports</b> as suggestions." },
  ],
  skills_diff: { added: [{ id: "s1", name: "owasp", version: 2 }], removed: [], changed: [{ name: "secrets", from: 1, to: 3 }] },
  same_skills: false,
  promote: { version: 7, restore: [{ id: "s1", name: "owasp", version: 2 }], missing: ["old-skill"] },
};

afterEach(() => {
  cleanup();
  for (const m of [get, post, toastSuccess]) m.mockReset();
});

function renderModal(cmp: EvalCompare | Error, onClose = vi.fn()) {
  get.mockImplementation(async (p: string) => {
    if (!p.startsWith("/eval-runs/compare?a=r6&b=r7")) throw new Error(`unexpected GET ${p}`);
    if (cmp instanceof Error) throw cmp;
    return cmp;
  });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, common }}>
        <CompareRunsModal agentId="a1" runIds={["r6", "r7"]} onClose={onClose} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onClose;
}

describe("CompareRunsModal", () => {
  it("shows old → new with signed deltas, the prompt diff as plain text, and the skill difference", async () => {
    renderModal(CMP);
    expect(await screen.findByText("v6 → v7")).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("4 pts")).toBeInTheDocument();
    expect(screen.getAllByText("2 pts").length).toBe(1); // precision down 2
    expect(screen.getByText("$0.21")).toBeInTheDocument();
    // The diff keeps its markers and renders prompt text as text, never as markup.
    const added = screen.getByText("<b>Flag unused imports</b> as suggestions.");
    expect(added.getAttribute("data-op")).toBe("add");
    expect(added.querySelector("b")).toBeNull();
    expect(screen.getByText("Return at most 3 findings.").getAttribute("data-op")).toBe("del");
    expect(screen.getByText("Added: owasp")).toBeInTheDocument();
    expect(screen.getByText("secrets v1 → v3")).toBeInTheDocument();
  });

  it("shows n/a for a metric with no data on either side, never a dash or 0% (AC-43)", async () => {
    renderModal({
      ...CMP,
      older: run("r6", 6, { metrics: { recall: 0.78, precision: null, citation_accuracy: 0.94 } }),
      newer: run("r7", 7, { metrics: { recall: 0.82, precision: null, citation_accuracy: 0.95 } }),
      deltas: { recall: 0.04, precision: null, citation_accuracy: 0.01, cost_usd: 0.02 },
    });
    expect(await screen.findByText("v6 → v7")).toBeInTheDocument();
    expect(screen.getAllByText("n/a").length).toBeGreaterThanOrEqual(2); // precision: old and new
    expect(screen.queryByText("–")).toBeNull();
    expect(screen.queryByText("0%")).toBeNull();
  });

  it("states 'same prompt version' and 'same skills' instead of a diff when nothing differs", async () => {
    renderModal({ ...CMP, same_version: true, prompt_diff: null, same_skills: true, skills_diff: { added: [], removed: [], changed: [] }, promote: null });
    expect(await screen.findByText("same prompt version")).toBeInTheDocument();
    expect(screen.getByText("same skills")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Promote/ })).toBeNull();
  });

  it("asks before promoting, lists what is restored and what is missing, then promotes the newer run", async () => {
    post.mockResolvedValue({ agent_id: "a1", version: 8 });
    const onClose = renderModal(CMP);
    fireEvent.click(await screen.findByRole("button", { name: "Promote v7" }));
    const confirm = (await screen.findAllByRole("dialog")).at(-1)!;
    expect(within(confirm).getByText("Promote v7?")).toBeInTheDocument();
    expect(within(confirm).getByText("owasp v2")).toBeInTheDocument();
    expect(within(confirm).getByText("No longer exist and will be left out: old-skill")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByRole("button", { name: "Promote" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/eval-runs/r7/promote", undefined));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Promoted to v8"));
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the confirm open and gives the server's reason when the promote is refused", async () => {
    post.mockRejectedValue(new ApiError("The stored config for v7 is missing.", 422, "version_config_missing"));
    const onClose = renderModal(CMP);
    fireEvent.click(await screen.findByRole("button", { name: "Promote v7" }));
    const confirm = (await screen.findAllByRole("dialog")).at(-1)!;
    fireEvent.click(within(confirm).getByRole("button", { name: "Promote" }));
    expect(await within(confirm).findByRole("alert")).toHaveTextContent("The stored config for v7 is missing.");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("says the runs cannot be compared when the server refuses the pair", async () => {
    renderModal(new ApiError("different agents", 422, "runs_not_comparable"));
    expect(await screen.findByText(evalMessages.compare.notComparable)).toBeInTheDocument();
  });
});
