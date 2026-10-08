/* hooks/context.ts — React Query hooks for project context: the documents of a
   repo, one document's content, and the repo's search roots. The attachments an
   agent or a skill carries live with their owners (agents.ts / skills.ts). */
"use client";

import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ContextListing, ContextRoots, SpecFile } from "@devdigest/shared";

/**
 * The context documents available in a repo — the pool the pickers and the
 * Project Context page choose from. Keyed by repo because a workspace holds
 * several, and a path only means something inside one of them. Listing entries
 * carry no `content`; that is `useContextDoc`.
 */
export function useContextDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context-docs", repoId],
    queryFn: () => api.get<ContextListing>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

/** One context document with its content — the preview behind a path. */
export function useContextDoc(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["context-doc", repoId, path],
    queryFn: () =>
      api.get<SpecFile>(`/repos/${repoId}/context/doc?path=${encodeURIComponent(path!)}`),
    enabled: !!repoId && !!path,
    // A 422 (too large / outside the search roots) will not heal on retry.
    retry: false,
  });
}

/**
 * Paths added or removed between two attachment lists (symmetric difference;
 * a pure reorder changes none). `null` when the previous list is unknown, so
 * the caller falls back to invalidating every document.
 */
export function changedPaths(
  before: readonly string[] | undefined,
  after: readonly string[],
): string[] | null {
  if (!before) return null;
  const was = new Set(before);
  const is = new Set(after);
  return [...was].filter((p) => !is.has(p)).concat([...is].filter((p) => !was.has(p)));
}

/**
 * Refetch the `["context-doc", repoId, path]` queries of the given paths only
 * ("used by N agents" shows on those); `null` means every document.
 */
export function invalidateContextDocs(qc: QueryClient, paths: string[] | null) {
  return qc.invalidateQueries({
    predicate: ({ queryKey }) =>
      queryKey[0] === "context-doc" && (paths === null || paths.includes(String(queryKey[2]))),
  });
}

/** The repo's search roots (globs) and whether they are the defaults. */
export function useContextRoots(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context-roots", repoId],
    queryFn: () => api.get<ContextRoots>(`/repos/${repoId}/context/roots`),
    enabled: !!repoId,
  });
}

/** Replace the roots wholesale; the server answers 422 naming a glob it refuses. */
export function useSetContextRoots() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, globs }: { repoId: string; globs: string[] }) =>
      api.put<ContextRoots>(`/repos/${repoId}/context/roots`, { globs }),
    onSuccess: (data, { repoId }) => {
      qc.setQueryData(["context-roots", repoId], data);
      // Changing the roots changes which documents exist.
      qc.invalidateQueries({ queryKey: ["context-docs", repoId] });
    },
  });
}

/** Back to the default roots. */
export function useResetContextRoots() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId }: { repoId: string }) =>
      api.del<ContextRoots>(`/repos/${repoId}/context/roots`),
    onSuccess: (data, { repoId }) => {
      qc.setQueryData(["context-roots", repoId], data);
      qc.invalidateQueries({ queryKey: ["context-docs", repoId] });
    },
  });
}
