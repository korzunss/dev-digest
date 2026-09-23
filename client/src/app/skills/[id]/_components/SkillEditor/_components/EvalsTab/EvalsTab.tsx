/* EvalsTab — deliberately a placeholder. Scoring a skill needs eval sets, and
   those arrive with a later lesson; the tab exists now so the editor's shape is
   the final one and the header's disabled "Run on evals" has somewhere to point. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";

export function EvalsTab({ skill: _skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return <EmptyState icon="FlaskConical" title={t("evals.empty.title")} body={t("evals.empty.body")} />;
}
