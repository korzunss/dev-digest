/* Onboarding Tour page — the wiring the component tests cannot see (spec 009).
   Hooks are REAL; the network edge (`api`) is stubbed, so assertions are about what the page
   requests and shows. AppShell, router and repo context are stubbed (the shell has its own smoke
   test); mermaid is stubbed. No `@testing-library/user-event` in this package. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OnboardingTourView } from "@devdigest/shared";
import onboarding from "../../../../../messages/en/onboarding.json";

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, crumb }: { children: React.ReactNode; crumb?: Array<{ label: string }> }) => (
    <div>
      <nav aria-label="breadcrumb">{(crumb ?? []).map((c) => c.label).join(" › ")}</nav>
      {children}
    </div>
  ),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repos: [{ id: "r1", full_name: "acme/api", provider: "github", api_base: null }],
    reposLoaded: true,
  }),
  useRepoNotFound: () => false,
}));
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), toast: vi.fn() };
vi.mock("@/lib/toast", () => ({ useToast: () => toast }));

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), parse: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: mermaid }));

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p), post: (p: string) => post(p) },
}));

import OnboardingTourPage from "./page";

const OK = { available: true, cause: null, reason: null } as const;
const row = (path: string, over: Record<string, unknown> = {}) => ({
  path,
  reason: null,
  rank_position: 1,
  importers: 3,
  chain: [],
  ...over,
});

function makeView(over: Partial<OnboardingTourView> = {}): OnboardingTourView {
  return {
    repo_id: "r1",
    clone: { state: "ready", error: null },
    index: {
      status: "full",
      reason: null,
      files_indexed: 42,
      source_files_total: 42,
      coverage_partial: false,
      partial_cause: null,
      last_indexed_sha: "abc123",
    },
    model: { provider: "anthropic", model: "claude-test-1" },
    generating: false,
    stale: false,
    last_failure: null,
    stored: false,
    tour: {
      source: "skeleton",
      built_sha: "abc123",
      generated_at: null,
      index_files: 42,
      model: null,
      architecture: {
        availability: OK,
        body: "Fastify API plus a Next studio.",
        diagram: "flowchart TD\n  A[client] --> B[server]",
        stack: ["TypeScript"],
        structure: ["server/"],
      },
      critical_paths: { availability: OK, rows: [row("src/core.ts", { rank_position: 2, importers: 14 })] },
      run_locally: { availability: OK, commands: [{ command: "pnpm install", note: null }] },
      reading_path: { availability: OK, steps: [row("src/entry.ts")] },
      first_tasks: { availability: { available: false, cause: "model_failed", reason: "no_key" }, tasks: [] },
    },
    ...over,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ onboarding }}>
        <OnboardingTourPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function serve(view: OnboardingTourView) {
  get.mockImplementation(async (path: string) => {
    if (path === "/repos/r1/onboarding") return view;
    throw new Error(`unexpected GET ${path}`);
  });
}

beforeEach(() => {
  mermaid.parse.mockReset().mockResolvedValue(true);
  mermaid.render.mockReset().mockResolvedValue({ svg: '<svg role="img" aria-label="architecture diagram"></svg>' });
  mermaid.initialize.mockReset();
});
afterEach(() => {
  cleanup();
  get.mockReset();
  post.mockReset();
});

describe("Onboarding Tour page", () => {
  // AC-3: the breadcrumb reads `<owner>/<repo> › Onboarding Tour`
  it("AC-3: shows the breadcrumb 'acme/api › Onboarding Tour'", async () => {
    serve(makeView());
    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Architecture" });
    expect(screen.getByRole("navigation", { name: "breadcrumb" })).toHaveTextContent("acme/api › Onboarding Tour");
  });

  // AC-24 + AC-12: opening a repo with no stored tour shows the skeleton and Generate, and makes no generate call
  it("AC-24/AC-12: shows the skeleton sections in spec order with Generate, and does not POST on open", async () => {
    serve(makeView({ stored: false }));
    renderPage();
    expect(await screen.findByRole("button", { name: "Generate" })).toBeEnabled();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Architecture", "Critical paths", "Run it locally", "Guided reading path", "First tasks"]);
    expect(screen.getByText("rank #2 · imported by 14 files")).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/repos/r1/onboarding");
    expect(post).not.toHaveBeenCalled();
    // AC-29: every section starts expanded on load
    for (const name of headings) {
      expect(screen.getByRole("button", { name: name! })).toHaveAttribute("aria-expanded", "true");
    }
  });

  // AC-12: Generate is the only trigger of the POST
  it("AC-12: Generate sends exactly one POST to the generate endpoint", async () => {
    serve(makeView());
    post.mockResolvedValue(makeView({ stored: true }));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Generate" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith("/repos/r1/onboarding/generate");
    expect(await screen.findByRole("button", { name: "Regenerate" })).toBeInTheDocument();
  });

  // AC-13: while the POST is in flight the control is disabled, so a double click sends one request
  it("AC-13: a pending POST disables the action and a second click does not send another", async () => {
    serve(makeView());
    let release!: (v: OnboardingTourView) => void;
    post.mockImplementation(() => new Promise<OnboardingTourView>((r) => (release = r)));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Generate" }));

    const busy = await screen.findByRole("button", { name: /Generating…/ });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    expect(post).toHaveBeenCalledTimes(1);

    release(makeView({ generating: true }));
    // the server flag keeps it busy after the POST settles
    await waitFor(() => expect(screen.getByRole("button", { name: /Generating…/ })).toBeDisabled());
    expect(post).toHaveBeenCalledTimes(1);
  });

  // AC-13: a view that already reports generating (second tab) shows it and offers no second start
  it("AC-13: opening the page while the server is generating shows Generating… disabled", async () => {
    serve(makeView({ generating: true }));
    renderPage();
    expect(await screen.findByRole("button", { name: /Generating…/ })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });

  // AC-20: no clone / cloning → empty state naming the status, no Generate, no tour sections
  it.each([
    ["none", onboarding.clone.none],
    ["cloning", onboarding.clone.cloning],
  ] as const)("AC-20: clone state %s shows the empty state without Generate", async (state, copy) => {
    serve(makeView({ clone: { state, error: null } }));
    renderPage();
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate|Regenerate/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  // AC-21: failed clone → error with the failure reason and a Re-clone that re-queues via /refresh
  it("AC-21: a failed clone shows the reason and Re-clone posts to the repo refresh endpoint", async () => {
    serve(makeView({ clone: { state: "failed", error: "fatal: repository not found" } }));
    post.mockResolvedValue({});
    renderPage();
    expect(await screen.findByText(onboarding.clone.failed)).toBeInTheDocument();
    expect(screen.getByText("fatal: repository not found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate|Regenerate/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Re-clone" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/repos/r1/refresh"));
  });

  // AC-22: a non-full index keeps the skeleton visible and labelled with status + reason
  it("AC-22: a failed index still shows the skeleton, labelled with status and reason", async () => {
    serve(
      makeView({
        index: {
          status: "failed",
          reason: "index_failed",
          files_indexed: 0,
          source_files_total: null,
          coverage_partial: false,
          partial_cause: null,
          last_indexed_sha: "",
        },
      }),
    );
    renderPage();
    expect(await screen.findByText("Index failed · The last indexing run failed")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Architecture" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument();
  });

  // AC-7: non-JS/TS repo — graph sections not available for the language, the others still render
  it("AC-7/AC-37: graph sections say the language is not indexed while architecture and commands still render", async () => {
    const view = makeView();
    const na = { available: false, cause: "language_not_indexed", reason: null } as const;
    view.tour.critical_paths = { availability: na, rows: [] };
    view.tour.reading_path = { availability: na, steps: [] };
    serve(view);
    renderPage();
    await screen.findByText("Fastify API plus a Next studio.");
    expect(screen.getAllByText(onboarding.unavailable.language_not_indexed)).toHaveLength(2);
    expect(screen.getByText("pnpm install")).toBeInTheDocument();
    expect(screen.getByText("server/")).toBeInTheDocument();
  });

  // AC-8 + AC-37: empty graph from a failed index — not available, with the reason and a re-sync step
  it("AC-8/AC-37: an index-failed graph section names the cause and reason and offers Re-sync", async () => {
    const view = makeView();
    view.tour.critical_paths = { availability: { available: false, cause: "index_failed", reason: "index_failed" }, rows: [] };
    serve(view);
    renderPage();
    const section = (await screen.findByRole("heading", { level: 2, name: "Critical paths" })).closest("section")!;
    expect(within(section).getByText(onboarding.unavailable.index_failed)).toBeInTheDocument();
    expect(within(section).getByText(onboarding.indexReason.index_failed)).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Re-sync index" })).toBeInTheDocument();
  });

  // AC-18 + AC-37: model failure — First tasks not available, with cause and Settings → Models next step
  it("AC-18/AC-37: First tasks is not available with the model cause and a link to model settings", async () => {
    serve(makeView({ last_failure: { reason: "no_key", message: "no key", at: "2026-10-05T11:00:00Z" } }));
    renderPage();
    const section = (await screen.findByRole("heading", { level: 2, name: "First tasks" })).closest("section")!;
    expect(within(section).getByText(onboarding.unavailable.model_failed)).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "Open model settings" })).toHaveAttribute("href", "/settings/models");
    // the skeleton remains and the failure is named in the header
    expect(screen.getByText("Fastify API plus a Next studio.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(onboarding.failure.no_key);
  });

  // AC-19: a failed Regenerate leaves the stored tour on screen
  it("AC-19: after a failed Regenerate the stored tour content is still shown with the failure", async () => {
    const stored = makeView({ stored: true });
    stored.tour.source = "llm";
    stored.tour.generated_at = "2026-10-05T10:00:00Z";
    stored.tour.first_tasks = {
      availability: OK,
      tasks: [{ title: "Add a health check", body: "Wire it up", files: ["src/core.ts"] }],
    };
    serve(stored);
    post.mockResolvedValue({
      ...stored,
      last_failure: { reason: "timeout", message: "deadline", at: "2026-10-05T11:00:00Z" },
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(onboarding.failure.timeout);
    expect(screen.getByText("Add a health check")).toBeInTheDocument();
    expect(screen.getByText("Fastify API plus a Next studio.")).toBeInTheDocument();
  });

  // AC-27: stale marker + Regenerate come through the page
  it("AC-27: a stale stored tour shows the stale banner", async () => {
    serve(makeView({ stored: true, stale: true }));
    renderPage();
    expect(await screen.findByText(onboarding.header.stale)).toBeInTheDocument();
  });

  // AC-35: a diagram is shown in the Architecture section only
  it("AC-35: renders the diagram once, inside the Architecture section", async () => {
    serve(makeView());
    renderPage();
    const arch = (await screen.findByRole("heading", { level: 2, name: "Architecture" })).closest("section")!;
    const img = await screen.findByRole("img", { name: "architecture diagram" });
    expect(arch).toContainElement(img);
    expect(screen.getAllByRole("img", { name: "architecture diagram" })).toHaveLength(1);
    expect(mermaid.render).toHaveBeenCalledTimes(1);
  });

  // load failure → retryable error, not a blank page
  it("shows a retryable error when the tour cannot be loaded", async () => {
    get.mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByText(onboarding.page.loadError)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate/ })).not.toBeInTheDocument();
  });
});
