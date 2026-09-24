"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ShellContext } from "@devdigest/ui";
import { useTheme } from "../../../lib/theme";
import { useActiveRepo } from "../../../lib/repo-context";
import { usePulls, useDeleteRepo } from "../../../lib/hooks";
import { activeKeyFor, toShellRepo } from "../helpers";

interface ShellContextOptions {
  onOpenCommandPalette: () => void;
}

/** The repo a removal has been requested for, plus the two ways out. */
export interface RepoRemoval {
  /** Non-null while the confirmation is open. */
  repo: { id: string; fullName: string; forge: string } | null;
  pending: boolean;
  confirm: () => void;
  cancel: () => void;
}

/**
 * Assembles the `ShellContext` consumed by AppFrame: active nav key, the repo
 * list/active repo (mapped to the shell shape), theme, PR count, and the repo
 * selection / add / removal actions.
 *
 * Removal is returned ALONGSIDE the context rather than handled inside it:
 * `ctx.onRemoveRepo` now only *asks*, and AppShell renders the confirmation.
 * A hook cannot render, and `window.confirm` — which could be called from one —
 * is what we are replacing.
 */
export function useShellContext({ onOpenCommandPalette }: ShellContextOptions): {
  ctx: ShellContext;
  removal: RepoRemoval;
} {
  const t = useTranslations("shell");
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const { repoId, repos, activeRepo, setRepoId } = useActiveRepo();
  const { data: pulls } = usePulls(repoId);
  const deleteRepo = useDeleteRepo();

  const onSelectRepo = React.useCallback(
    (id: string) => {
      setRepoId(id);
      router.push(`/repos/${id}/pulls`);
    },
    [setRepoId, router],
  );

  const onAddRepo = React.useCallback(() => router.push("/onboarding"), [router]);

  const [removingId, setRemovingId] = React.useState<string | null>(null);

  // Only asks. The answer is collected by the ConfirmModal AppShell renders.
  const onRemoveRepo = React.useCallback((id: string) => setRemovingId(id), []);

  const cancelRemoval = React.useCallback(() => setRemovingId(null), []);

  const confirmRemoval = React.useCallback(() => {
    const id = removingId;
    if (!id) return;
    deleteRepo.mutate(id, {
      onSuccess: () => {
        setRemovingId(null);
        if (repoId === id) {
          const next = repos.find((r) => r.id !== id);
          router.push(next ? `/repos/${next.id}/pulls` : "/onboarding");
        }
      },
      onError: () => setRemovingId(null),
    });
  }, [removingId, repos, repoId, deleteRepo, router]);

  const removalTarget = removingId ? repos.find((r) => r.id === removingId) : undefined;
  const removal = React.useMemo<RepoRemoval>(
    () => ({
      repo: removingId
        ? {
            id: removingId,
            fullName: removalTarget?.full_name ?? t("removeRepo.fallbackName"),
            // The old copy said "GitHub" unconditionally, which is wrong the
            // moment the repo lives on a GitLab instance.
            forge: removalTarget?.provider === "gitlab" ? "GitLab" : "GitHub",
          }
        : null,
      pending: deleteRepo.isPending,
      confirm: confirmRemoval,
      cancel: cancelRemoval,
    }),
    [removingId, removalTarget, t, deleteRepo.isPending, confirmRemoval, cancelRemoval],
  );

  const ctx = React.useMemo<ShellContext>(
    () => ({
      Link,
      activeKey: activeKeyFor(pathname),
      repoId,
      repos: repos.map(toShellRepo),
      activeRepo: activeRepo ? toShellRepo(activeRepo) : null,
      theme,
      onToggleTheme: toggle,
      onOpenCommandPalette,
      onSelectRepo,
      onAddRepo,
      onRemoveRepo,
      // Sidebar badge = PRs that still NEED review, not the total PR count.
      // 0 → undefined so the badge hides entirely when nothing needs review.
      prCount: pulls?.filter((p) => p.status === "needs_review").length || undefined,
    }),
    [
      pathname,
      repoId,
      repos,
      activeRepo,
      theme,
      toggle,
      onOpenCommandPalette,
      onSelectRepo,
      onAddRepo,
      onRemoveRepo,
      pulls,
    ],
  );

  return { ctx, removal };
}
