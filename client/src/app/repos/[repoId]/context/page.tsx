/* /repos/:repoId/context — Project Context (spec 008).

   A dynamic route like Conventions: the repo lives in the path, so the page is
   deep-linkable. Read-only on purpose — documents are edited in the repo, not
   here; the page shows what the engine would find (the listing under the repo's
   search roots), previews one, says how many agents use it, and lets the roots
   be changed. The page is thin: hooks, selection, the two empty/error states;
   the list, the roots editor and the footer are colocated under `_components/`. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { DocPreview } from "@/components/context-doc-preview";
import { RepoNotFound } from "@/components/repo-not-found";
import { ApiError } from "@/lib/api";
import {
  useContextDoc,
  useContextDocs,
  useContextRoots,
  useResetContextRoots,
  useSetContextRoots,
} from "@/lib/hooks/context";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ContextDocList, sumTokens } from "./_components/ContextDocList";
import { ContextFooter } from "./_components/ContextFooter";
import { ContextRootsEditor } from "./_components/ContextRootsEditor";
import { SKELETON_COUNT, SKELETON_HEIGHT } from "./constants";
import { s } from "./styles";

export default function ProjectContextPage() {
  const t = useTranslations("context");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;

  const { repos, reposLoaded } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const repo = repos.find((r) => r.id === repoId) ?? null;

  const listing = useContextDocs(repoId);
  const roots = useContextRoots(repoId);
  const setRoots = useSetContextRoots();
  const resetRoots = useResetContextRoots();

  const [picked, setPicked] = React.useState<string | null>(null);
  const docs = listing.data?.docs ?? [];
  // A selection the listing no longer has (roots changed, file removed) is no selection.
  const selected = docs.some((d) => d.path === picked) ? picked : null;
  const selectedDoc = useContextDoc(repoId, selected);

  const crumb = [{ label: t("page.crumbRepo") }, { label: t("title") }];

  // A stale :repoId is a wrong link, not a failure — same treatment as the PR list.
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const rootsError = [setRoots, resetRoots]
    .map((m) => (m.isError ? (m.error instanceof ApiError ? m.error.message : t("roots.saveFailed")) : null))
    .find((m) => m !== null) ?? null;

  return (
    <AppShell crumb={crumb}>
      <div style={s.header}>
        <h1 style={s.title}>
          {t("title")}
          {repo && (
            <>
              {" "}
              <span className="mono" style={s.repo}>
                {repo.full_name}
              </span>
            </>
          )}
        </h1>
        <p style={s.subtitle}>{t("page.subtitle")}</p>
      </div>

      <div style={s.body}>
        {listing.isLoading || !reposLoaded ? (
          <div style={s.loadingStack}>
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <Skeleton key={i} height={SKELETON_HEIGHT} />
            ))}
          </div>
        ) : listing.isError ? (
          <ErrorState body={t("page.loadError")} onRetry={() => listing.refetch()} />
        ) : (
          <div style={s.columns}>
            <ContextDocList
              docs={docs}
              truncated={listing.data?.truncated ?? false}
              cloned={!!repo?.clone_path}
              selected={selected}
              refreshing={listing.isFetching}
              onSelect={setPicked}
              onRefresh={() => listing.refetch()}
            />
            <div style={s.detail}>
              {selected ? (
                <>
                  <div style={s.detailHead}>
                    <span className="mono" style={s.detailPath}>
                      {selected}
                    </span>
                    {selectedDoc.data?.used_by_agents != null && (
                      <Badge color="var(--text-secondary)">
                        {t("page.usedBy", { count: selectedDoc.data.used_by_agents })}
                      </Badge>
                    )}
                  </div>
                  <div style={s.detailBody}>
                    <DocPreview repoId={repoId} path={selected} />
                  </div>
                </>
              ) : (
                <div style={s.placeholder}>{t("page.selectHint")}</div>
              )}
            </div>
          </div>
        )}

        {roots.isLoading ? (
          <div style={s.roots}>
            <Skeleton height={SKELETON_HEIGHT} />
          </div>
        ) : roots.isError ? (
          <div style={s.roots}>
            <ErrorState body={t("roots.loadError")} onRetry={() => roots.refetch()} />
          </div>
        ) : roots.data ? (
          <div style={s.roots}>
            <ContextRootsEditor
              key={roots.data.globs.join("\n")}
              roots={roots.data}
              saving={setRoots.isPending || resetRoots.isPending}
              error={rootsError}
              onSave={(globs) => {
                resetRoots.reset();
                setRoots.mutate({ repoId, globs });
              }}
              onReset={() => {
                setRoots.reset();
                resetRoots.mutate({ repoId });
              }}
            />
          </div>
        ) : null}

        <ContextFooter
          count={docs.length}
          tokens={sumTokens(docs)}
          lastSync={repo?.last_polled_at}
        />
      </div>
    </AppShell>
  );
}
