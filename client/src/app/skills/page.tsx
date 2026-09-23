/* /skills — the Skills Lab. The rail is the whole page until a skill is picked;
   picking one navigates to /skills/:id, so a selection is a URL with its own
   tabs rather than a query param on this one. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import { AppShell } from "../../components/app-shell";
import { SkillsRail, layout } from "./_components/SkillsRail";

export default function SkillsPage() {
  const t = useTranslations("skills");

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      <div style={layout.split}>
        <SkillsRail />
        <div style={layout.paneCentered}>
          <EmptyState
            icon="Sparkles"
            title={t("page.selectPrompt.title")}
            body={t("page.selectPrompt.body")}
          />
        </div>
      </div>
    </AppShell>
  );
}
