/* Project Context page — the wiring the component tests cannot see: the page
   owns the requests, so Refresh, the roots Save/Reset mutations and the 422
   message are only real here. Hooks are REAL; the network edge (`api`) is
   stubbed, so the assertions are about what the page sends and shows.
   `AppShell`, the router and the repo context are stubbed — the shell has its own
   smoke test. No `@testing-library/user-event` in this package. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import context from "../../../../../messages/en/context.json";

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
let reposLoaded = true;
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repos: reposLoaded ? [{ id: "r1", full_name: "acme/api", clone_path: "/c/acme/api", last_polled_at: null }] : [],
    reposLoaded,
  }),
  useRepoNotFound: () => false,
}));

const get = vi.fn();
const put = vi.fn();
const del = vi.fn();
vi.mock("@/lib/api", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/api")>()),
  api: { get: (p: string) => get(p), put: (p: string, b: unknown) => put(p, b), del: (p: string) => del(p) },
}));

import { ApiError } from "@/lib/api";
import ProjectContextPage from "./page";

const DEFAULT_ROOTS = { globs: ["**/{specs,docs,insights}/**/*.md"], is_default: true };
const CUSTOM_ROOTS = { globs: ["docs/**/*.md"], is_default: false };

let listCalls = 0;
function routeGets(roots = DEFAULT_ROOTS) {
  get.mockImplementation(async (path: string) => {
    if (path === "/repos/r1/context") {
      listCalls++;
      return { docs: [{ path: "specs/a.md", size: 5, updated_at: "2026-01-01T00:00:00Z", type: "specs", tokens: 7 }], truncated: false };
    }
    if (path === "/repos/r1/context/roots") return roots;
    throw new Error(`unexpected GET ${path}`);
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ context }}>
        <ProjectContextPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const rootsBox = () => screen.getByLabelText("Search roots, one glob per line") as HTMLTextAreaElement;

beforeEach(() => {
  listCalls = 0;
  reposLoaded = true;
});
afterEach(() => {
  cleanup();
  get.mockReset();
  put.mockReset();
  del.mockReset();
});

describe("Project Context page wiring", () => {
  // Refresh re-requests the listing, not a stale cache hit
  it("Refresh refetches the document listing", async () => {
    routeGets();
    renderPage();
    await screen.findByText("specs/a.md");
    expect(listCalls).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(listCalls).toBe(2));
  });

  // a refused save (422) surfaces the server's message and keeps the user's draft
  it("shows the server's 422 message in an alert and keeps the draft", async () => {
    routeGets();
    put.mockRejectedValue(new ApiError('Invalid search root "**/*.txt": glob must end in .md', 422));
    renderPage();
    await screen.findByText("specs/a.md");
    await screen.findByLabelText("Search roots, one glob per line");
    fireEvent.change(rootsBox(), { target: { value: "**/*.txt" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("glob must end in .md");
    expect(put).toHaveBeenCalledWith("/repos/r1/context/roots", { globs: ["**/*.txt"] });
    expect(rootsBox().value).toBe("**/*.txt");
  });

  // a non-API failure falls back to the generic copy rather than leaking the raw error
  it("shows the generic message for an unexpected failure", async () => {
    routeGets();
    put.mockRejectedValue(new Error("socket hang up"));
    renderPage();
    await screen.findByText("specs/a.md");
    fireEvent.change(await screen.findByLabelText("Search roots, one glob per line"), {
      target: { value: "docs/**/*.md" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not save the search roots.");
    expect(alert).not.toHaveTextContent("socket hang up");
  });

  // a successful save writes the roots cache and re-lists the documents
  it("a successful save re-lists the documents and shows the saved roots", async () => {
    routeGets();
    put.mockResolvedValue(CUSTOM_ROOTS);
    renderPage();
    await screen.findByText("specs/a.md");
    fireEvent.change(await screen.findByLabelText("Search roots, one glob per line"), {
      target: { value: "docs/**/*.md" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(listCalls).toBe(2));
    expect(put).toHaveBeenCalledWith("/repos/r1/context/roots", { globs: ["docs/**/*.md"] });
    expect(screen.queryByText("default")).not.toBeInTheDocument();
  });

  // Reset sends DELETE and the editor shows the restored default roots
  it("Reset to default deletes the custom roots and re-seeds the editor", async () => {
    routeGets(CUSTOM_ROOTS);
    del.mockResolvedValue(DEFAULT_ROOTS);
    renderPage();
    await screen.findByText("specs/a.md");
    await waitFor(() => expect(rootsBox().value).toBe("docs/**/*.md"));
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));

    await waitFor(() => expect(rootsBox().value).toBe(DEFAULT_ROOTS.globs[0]));
    expect(del).toHaveBeenCalledWith("/repos/r1/context/roots");
    expect(screen.getByText("default")).toBeInTheDocument();
    await waitFor(() => expect(listCalls).toBe(2));
  });

  // a failed roots GET shows the load error and Retry refetches it
  it("shows a roots load error with Retry that refetches", async () => {
    let rootsCalls = 0;
    get.mockImplementation(async (path: string) => {
      if (path === "/repos/r1/context") return { docs: [], truncated: false };
      if (path === "/repos/r1/context/roots") {
        rootsCalls++;
        if (rootsCalls === 1) throw new Error("boom");
        return DEFAULT_ROOTS;
      }
      throw new Error(`unexpected GET ${path}`);
    });
    renderPage();
    expect(await screen.findByText("Could not load the search roots.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(rootsBox().value).toBe(DEFAULT_ROOTS.globs[0]));
    expect(screen.queryByText("Could not load the search roots.")).not.toBeInTheDocument();
  });

  // a stale Save error must not outlive a later successful Reset
  it("a failed Save followed by a successful Reset shows no error", async () => {
    routeGets(CUSTOM_ROOTS);
    put.mockRejectedValue(new ApiError("nope", 422));
    del.mockResolvedValue(DEFAULT_ROOTS);
    renderPage();
    await screen.findByText("specs/a.md");
    await waitFor(() => expect(rootsBox().value).toBe("docs/**/*.md"));
    fireEvent.change(rootsBox(), { target: { value: "x/**/*.md" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("nope");
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    await waitFor(() => expect(rootsBox().value).toBe(DEFAULT_ROOTS.globs[0]));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // before the repos load the repo is unknown, so "not cloned" would be a lie
  it("does not show the not-cloned state while the repos are still loading", async () => {
    reposLoaded = false;
    get.mockImplementation(async (path: string) => {
      if (path === "/repos/r1/context") return { docs: [], truncated: false };
      if (path === "/repos/r1/context/roots") return DEFAULT_ROOTS;
      throw new Error(`unexpected GET ${path}`);
    });
    renderPage();
    await screen.findByLabelText("Search roots, one glob per line");
    expect(screen.queryByText("Repository not cloned yet")).not.toBeInTheDocument();
    expect(screen.queryByText("No documents match the search roots")).not.toBeInTheDocument();
  });
});
