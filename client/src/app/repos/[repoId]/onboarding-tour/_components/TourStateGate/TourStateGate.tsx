/* TourStateGate — what the page shows instead of the tour when the repo has no
   usable clone: nothing to generate from (AC-20), or a failed clone that can be
   retried (AC-21). Never offers Generate. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState } from "@devdigest/ui";
import type { OnboardingTourView } from "@devdigest/shared";
import { useRefreshRepo } from "@/lib/hooks/core";

export function TourStateGate({ repoId, clone }: { repoId: string; clone: OnboardingTourView["clone"] }) {
  const t = useTranslations("onboarding");
  const reclone = useRefreshRepo();

  if (clone.state === "failed") {
    return (
      <div>
        <ErrorState title={t("clone.failed")} body={clone.error} />
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button
            kind="secondary"
            icon="RefreshCw"
            loading={reclone.isPending}
            onClick={() => reclone.mutate(repoId)}
          >
            {t("actions.reclone")}
          </Button>
        </div>
      </div>
    );
  }

  const cloning = clone.state === "cloning";
  return <EmptyState icon="GitBranch" title={cloning ? t("clone.cloning") : t("clone.none")} />;
}
