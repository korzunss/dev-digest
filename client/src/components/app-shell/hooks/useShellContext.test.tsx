/**
 * Removing a repository asks through a rendered dialog now, so the hook that
 * owns the action only *requests* removal — `ctx.onRemoveRepo` no longer
 * deletes, and nothing calls `window.confirm` (a hook cannot render one that
 * is themeable, and the old one could not carry next-intl copy either).
 *
 * `fireEvent`/`act`, not `userEvent` — that package is not a dependency here
 * (client/INSIGHTS.md).
 */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Repo } from "@devdigest/shared";
import shell from "../../../../messages/en/shell.json";
import { useShellContext } from "./useShellContext";

const mutate = vi.fn();
const push = vi.fn();

const repos: Repo[] = [
  {
    id: "r1",
    workspace_id: "w1",
    provider: "gitlab",
    api_base: "https://gitlab.sharksw.com",
    owner: "team",
    name: "svc",
    full_name: "team/svc",
    default_branch: "main",
    clone_path: null,
    last_polled_at: null,
    created_by: null,
  },
  {
    id: "r2",
    workspace_id: "w1",
    provider: "github",
    api_base: null,
    owner: "acme",
    name: "api",
    full_name: "acme/api",
    default_branch: "main",
    clone_path: null,
    last_polled_at: null,
    created_by: null,
  },
];

vi.mock("next/navigation", () => ({
  usePathname: () => "/repos/r1/pulls",
  useRouter: () => ({ push }),
}));
vi.mock("../../../lib/theme", () => ({ useTheme: () => ({ theme: "dark", toggle: vi.fn() }) }));
vi.mock("../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: "r1", repos, activeRepo: repos[0], setRepoId: vi.fn() }),
}));
vi.mock("../../../lib/hooks", () => ({
  usePulls: () => ({ data: [] }),
  useDeleteRepo: () => ({ mutate, isPending: false }),
}));

beforeEach(() => {
  mutate.mockReset();
  push.mockReset();
});
afterEach(cleanup);

function renderShellHook() {
  return renderHook(() => useShellContext({ onOpenCommandPalette: vi.fn() }), {
    wrapper: ({ children }) => (
      <NextIntlClientProvider locale="en" messages={{ shell }}>
        {children}
      </NextIntlClientProvider>
    ),
  });
}

describe("useShellContext — repo removal", () => {
  it("asks instead of deleting, and never calls window.confirm", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const { result } = renderShellHook();

    expect(result.current.removal.repo).toBeNull();
    act(() => result.current.ctx.onRemoveRepo!("r1"));

    expect(result.current.removal.repo?.fullName).toBe("team/svc");
    expect(mutate).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("names the repo's own forge, not GitHub unconditionally", () => {
    // The old copy said "Nothing is deleted on GitHub" for every repo, which
    // became wrong the moment a project could live on GitLab.
    const { result } = renderShellHook();
    act(() => result.current.ctx.onRemoveRepo!("r1"));
    expect(result.current.removal.repo?.forge).toBe("GitLab");

    act(() => result.current.removal.cancel());
    act(() => result.current.ctx.onRemoveRepo!("r2"));
    expect(result.current.removal.repo?.forge).toBe("GitHub");
  });

  it("cancelling closes the dialog and deletes nothing", () => {
    const { result } = renderShellHook();
    act(() => result.current.ctx.onRemoveRepo!("r1"));
    act(() => result.current.removal.cancel());
    expect(result.current.removal.repo).toBeNull();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("confirming deletes the repo that was asked about", () => {
    const { result } = renderShellHook();
    act(() => result.current.ctx.onRemoveRepo!("r1"));
    act(() => result.current.removal.confirm());
    expect(mutate).toHaveBeenCalledWith("r1", expect.anything());
  });

  it("falls back to a translated name when the repo has already gone", () => {
    const { result } = renderShellHook();
    act(() => result.current.ctx.onRemoveRepo!("missing"));
    expect(result.current.removal.repo?.fullName).toBe(shell.removeRepo.fallbackName);
  });
});
