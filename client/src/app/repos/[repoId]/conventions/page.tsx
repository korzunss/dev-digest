/* /repos/:repoId/conventions — the Conventions screen (spec 004).

   A dynamic route on purpose: the repo lives in the path, so a scan is
   deep-linkable and the page never has to guess which repo "the active one" is.
   The page is thin — it holds the hooks, the single mutation every decision
   goes through, and the empty/error states; the header, the list and the cards
   are colocated under `_components/`. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useConventions, useExtractConventions, useUpdateConvention } from "@/lib/hooks/conventions";
import { ConventionsHeader } from "./_components/ConventionsHeader";
import { ConventionList } from "./_components/ConventionList";
import { CreateSkillFromConventionsModal } from "./_components/CreateSkillFromConventionsModal";
import { SKELETON_COUNT, SKELETON_HEIGHT } from "./constants";
import { s } from "./styles";

export default function ConventionsPage() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;

  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions();
  const update = useUpdateConvention();

  // Mounting the modal is what triggers the preview request, so the flag has
  // to gate the mount rather than a `hidden` prop — an unopened dialog must
  // not be asking the server to build anything.
  const [skillModalOpen, setSkillModalOpen] = React.useState(false);

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  // A stale :repoId is a wrong link, not a failure — same treatment as the PR list.
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const scan = data?.scan ?? null;
  const candidates = data?.candidates ?? [];
  const repoName = activeRepo?.full_name ?? t("page.repoFallback");
  const runExtraction = () => extract.mutate(repoId);

  return (
    <AppShell crumb={crumb}>
      <ConventionsHeader
        repoName={repoName}
        scan={scan}
        scanning={extract.isPending}
        onRescan={runExtraction}
      />

      {/* A scan row that reached `error` says the same thing as a failed
          request, and the user's next move is the same either way. */}
      {(extract.isError || scan?.status === "error") && (
        <div role="alert" style={s.banner}>
          {t("page.extractionFailed")}
        </div>
      )}

      <div style={s.body}>
        {isLoading ? (
          <div style={s.loadingStack}>
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <Skeleton key={i} height={SKELETON_HEIGHT} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />
        ) : candidates.length === 0 ? (
          // A scan that ran and kept nothing is a different story from never
          // having scanned: the first says the evidence gate ate everything,
          // the second is just an unused feature.
          <EmptyState
            icon="ListChecks"
            title={scan ? t("page.noEvidence.title") : t("page.empty.title")}
            body={scan ? t("page.noEvidence.body") : t("page.empty.body")}
            cta={scan ? t("page.noEvidence.cta") : t("page.empty.cta")}
            onCta={runExtraction}
            ctaLoading={extract.isPending}
          />
        ) : (
          <ConventionList
            candidates={candidates}
            repo={activeRepo ?? null}
            commitSha={scan?.commit_sha ?? null}
            savingId={update.isPending ? update.variables?.id : null}
            onUpdate={(id, patch) => update.mutate({ id, patch })}
            onCreateSkill={() => setSkillModalOpen(true)}
            creatingSkill={skillModalOpen}
          />
        )}
      </div>

      {skillModalOpen && (
        <CreateSkillFromConventionsModal
          repoId={repoId}
          onClose={() => setSkillModalOpen(false)}
        />
      )}
    </AppShell>
  );
}
