"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { Repo } from "@/lib/types";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { PriorPrsCard } from "../PriorPrsCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  prHeadSha: string | null | undefined;
  prBody: string | null | undefined;
  repo: Repo | null;
}

export function OverviewTab({ prId, prHeadSha, prBody, repo }: OverviewTabProps) {
  const t = useTranslations("brief");
  const tb = useTranslations("blast");
  return (
    <>
      <section>
        <SectionLabel icon="Sparkles">{t("intentCard.title")}</SectionLabel>
        <IntentCard prId={prId} prHeadSha={prHeadSha} />
      </section>
      <section>
        <SectionLabel icon="GitBranch">{tb("title")}</SectionLabel>
        <BlastRadiusCard prId={prId} headSha={prHeadSha} repo={repo} />
      </section>
      <section>
        <SectionLabel icon="Clock">{tb("history.title")}</SectionLabel>
        <PriorPrsCard prId={prId} headSha={prHeadSha} repo={repo} />
      </section>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
