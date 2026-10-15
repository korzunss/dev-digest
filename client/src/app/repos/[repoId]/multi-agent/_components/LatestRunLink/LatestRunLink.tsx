/* LatestRunLink — "Latest run for #N" + its status, linking to that run's
   results page (spec 013, AC-15g). Renders nothing while the PR has no run. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { MultiAgentRunSummary } from "@devdigest/shared";
import { statusColor } from "../status-color";
import { s } from "./styles";

export function LatestRunLink({
  repoId,
  run,
}: {
  repoId: string;
  run: MultiAgentRunSummary | null | undefined;
}) {
  const t = useTranslations("runs");
  if (!run) return null;
  const { color, bg } = statusColor(run.status);

  return (
    <Link href={`/repos/${repoId}/multi-agent/${run.id}`} style={s.link}>
      {t("recent.latestFor", { number: run.pr_number })}
      <span style={s.status(color, bg)}>{t(`overallStatus.${run.status}`)}</span>
      <Icon.ArrowRight size={13} aria-hidden="true" />
    </Link>
  );
}

export default LatestRunLink;
