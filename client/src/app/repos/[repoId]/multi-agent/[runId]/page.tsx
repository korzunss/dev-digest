/* /repos/:repoId/multi-agent/:runId — the results of one multi-agent run
   (spec 013). A thin shell: the crumb, the stale-repo state and a Suspense
   boundary for `useSearchParams` (the `?trace=` address parameter); the screen
   itself is `ResultsPage`. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useMultiAgentRun } from "@/lib/hooks/multi-agent";
import { ResultsPage } from "./_components/ResultsPage";

export default function MultiAgentResultsPage() {
  const t = useTranslations("runs");
  const { repoId, runId } = useParams<{ repoId: string; runId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  // Same query key as ResultsPage's: shared cache, one request.
  const run = useMultiAgentRun(runId);
  const prNumber = run.data?.pr_number;
  const crumb = [
    { label: activeRepo?.full_name ?? repoId, mono: true },
    { label: t("page.crumb") },
    ...(prNumber != null ? [{ label: `#${prNumber}`, mono: true }] : []),
  ];

  return (
    <AppShell crumb={crumb}>
      {repoNotFound ? (
        <RepoNotFound />
      ) : (
        <React.Suspense fallback={<Skeleton height={120} />}>
          <ResultsPage repoId={repoId} runId={runId} />
        </React.Suspense>
      )}
    </AppShell>
  );
}
