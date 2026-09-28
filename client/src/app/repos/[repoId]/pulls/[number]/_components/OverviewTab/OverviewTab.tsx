"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  prHeadSha: string | null | undefined;
  prBody: string | null | undefined;
}

export function OverviewTab({ prId, prHeadSha, prBody }: OverviewTabProps) {
  const t = useTranslations("brief");
  return (
    <>
      <section>
        <SectionLabel icon="Sparkles">{t("intentCard.title")}</SectionLabel>
        <IntentCard prId={prId} prHeadSha={prHeadSha} />
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
