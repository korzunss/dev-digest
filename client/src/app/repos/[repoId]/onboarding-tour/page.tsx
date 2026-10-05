/* /repos/:repoId/onboarding-tour — the Onboarding Tour screen (spec 009).

   A dynamic route like Conventions: the repo lives in the path, so the tour is
   deep-linkable. The page is thin — hooks, the loading/error/state gates; the
   header, the section frames, the section bodies and the section index are
   colocated under `_components/`. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { OnboardingTour } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import type { ForgeRepoRef } from "@/lib/forge-urls";
import { useGenerateOnboardingTour, useOnboardingTour } from "@/lib/hooks/onboarding";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ArchitectureSection } from "./_components/ArchitectureSection";
import { FileRowList } from "./_components/FileRowList";
import { FirstTasks } from "./_components/FirstTasks";
import { OnThisPage } from "./_components/OnThisPage";
import { ReadingPath } from "./_components/ReadingPath";
import { RunCommands } from "./_components/RunCommands";
import { TourHeader } from "./_components/TourHeader";
import { TourSection } from "./_components/TourSection";
import { TourStateGate } from "./_components/TourStateGate";
import { UnavailableNote } from "./_components/UnavailableNote";
import { SKELETON_COUNT, SKELETON_HEIGHT, TOUR_SECTIONS, type TourSectionKey } from "./constants";
import { s } from "./styles";

/** The body of one section: its content, or the "not available" note when the server says so. */
function SectionBody({
  sectionKey,
  tour,
  repoId,
  repo,
}: {
  sectionKey: TourSectionKey;
  tour: OnboardingTour;
  repoId: string;
  repo: ForgeRepoRef | null;
}) {
  const { architecture, critical_paths, run_locally, reading_path, first_tasks } = tour;
  const sha = tour.built_sha;
  switch (sectionKey) {
    case "architecture":
      return architecture.availability.available ? (
        <ArchitectureSection architecture={architecture} />
      ) : (
        <UnavailableNote availability={architecture.availability} repoId={repoId} />
      );
    case "criticalPaths":
      return critical_paths.availability.available ? (
        <FileRowList rows={critical_paths.rows} repo={repo} builtSha={sha} />
      ) : (
        <UnavailableNote availability={critical_paths.availability} repoId={repoId} />
      );
    case "runLocally":
      return run_locally.availability.available ? (
        <RunCommands commands={run_locally.commands} />
      ) : (
        <UnavailableNote availability={run_locally.availability} repoId={repoId} />
      );
    case "readingPath":
      return reading_path.availability.available ? (
        <ReadingPath steps={reading_path.steps} repo={repo} builtSha={sha} />
      ) : (
        <UnavailableNote availability={reading_path.availability} repoId={repoId} />
      );
    case "firstTasks":
      return first_tasks.availability.available ? (
        <FirstTasks tasks={first_tasks.tasks} />
      ) : (
        <UnavailableNote availability={first_tasks.availability} repoId={repoId} />
      );
  }
}

export default function OnboardingTourPage() {
  const t = useTranslations("onboarding");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;

  const { repos, reposLoaded } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const repo = repos.find((r) => r.id === repoId) ?? null;
  const repoName = repo?.full_name ?? "";

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
                  <TourSection key={sec.id} id={sec.id} icon={sec.icon} title={sec.title}>
                    <SectionBody sectionKey={sec.key} tour={view.tour} repoId={repoId} repo={repo} />
                  </TourSection>
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
