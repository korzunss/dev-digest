/* /repos/:repoId/multi-agent — Configure run (spec 013). A thin shell: the
   crumb, the stale-repo state and a Suspense boundary for `useSearchParams`
   (the `?pr=` address parameter); the screen itself is `ConfigureRun`. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useRepoNotFound } from "@/lib/repo-context";
import { ConfigureRun } from "./_components/ConfigureRun";

export default function MultiAgentPage() {
  const t = useTranslations("runs");
  const { repoId } = useParams<{ repoId: string }>();
  const repoNotFound = useRepoNotFound(repoId);
  const crumb = [{ label: t("page.crumb") }, { label: t("configure.crumb") }];

  return (
    <AppShell crumb={crumb}>
      {repoNotFound ? (
        <RepoNotFound />
      ) : (
        <React.Suspense fallback={<Skeleton height={120} />}>
          <ConfigureRun repoId={repoId} />
        </React.Suspense>
      )}
    </AppShell>
  );
}
