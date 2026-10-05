/* /repos/:repoId/onboarding-tour — the Onboarding Tour screen (spec 009).

   A dynamic route like Conventions: the repo lives in the path, so the tour is
   deep-linkable. The page is thin — hooks, the loading/error/state gates; the
   header, the section frames and the section index are colocated under
   `_components/`. The five section bodies are filled in by later steps. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useGenerateOnboardingTour, useOnboardingTour } from "@/lib/hooks/onboarding";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { OnThisPage } from "./_components/OnThisPage";
import { TourHeader } from "./_components/TourHeader";
import { TourSection } from "./_components/TourSection";
import { TourStateGate } from "./_components/TourStateGate";
import { SKELETON_COUNT, SKELETON_HEIGHT, TOUR_SECTIONS } from "./constants";
import { s } from "./styles";

export default function OnboardingTourPage() {
  const t = useTranslations("onboarding");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;

  const { repos, reposLoaded } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const repoName = repos.find((r) => r.id === repoId)?.full_name ?? "";

  const tour = useOnboardingTour(repoId);
  const generate = useGenerateOnboardingTour();

  const crumb = [{ label: repoName }, { label: t("title", { repo: repoName }) }];

  // A stale :repoId is a wrong link, not a failure — same treatment as the PR list.
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const view = tour.data;
  const sections = TOUR_SECTIONS.map((sec) => ({ ...sec, title: t(`sections.${sec.key}`) }));

  return (
    <AppShell crumb={crumb}>
      {tour.isLoading || !reposLoaded ? (
        <div style={s.body}>
          <div style={s.loadingStack}>
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <Skeleton key={i} height={SKELETON_HEIGHT} />
            ))}
          </div>
        </div>
      ) : tour.isError || !view ? (
        <div style={s.body}>
          <ErrorState body={t("page.loadError")} onRetry={() => tour.refetch()} />
        </div>
      ) : view.clone.state !== "ready" ? (
        <div style={s.body}>
          <TourStateGate repoId={repoId} clone={view.clone} />
        </div>
      ) : (
        <>
          <TourHeader
            repoName={repoName}
            view={view}
            pending={generate.isPending}
            onGenerate={() => generate.mutate(repoId)}
          />
          <div style={s.body}>
            <div style={s.columns}>
              <div style={s.sections}>
                {sections.map((sec) => (
                  <TourSection key={sec.id} id={sec.id} icon={sec.icon} title={sec.title} />
                ))}
              </div>
              <aside style={s.aside}>
                <OnThisPage items={sections.map((sec) => ({ id: sec.id, label: sec.title }))} />
              </aside>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
