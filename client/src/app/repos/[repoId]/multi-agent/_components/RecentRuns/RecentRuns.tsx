/* RecentRuns — the repository's latest multi-agent runs under the Configure run
   button (spec 013, AC-15b…f). Each row links to that run's results page. PR
   titles and agent names are plain text. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { MultiAgentRunSummary } from "@devdigest/shared";
import { formatCostUsd } from "@/lib/format-cost";
import { statusColor } from "../status-color";
import { formatRunDuration, listedAgentNames, MAX_LISTED_AGENTS } from "./helpers";
import { s } from "./styles";

export function RecentRuns({
  repoId,
  runs,
}: {
  repoId: string;
  runs: MultiAgentRunSummary[];
}) {
  const t = useTranslations("runs");

  return (
    <section style={s.section} aria-label={t("recent.title")}>
      <div style={s.title}>{t("recent.title")}</div>
      {runs.length === 0 ? (
        <div style={s.empty}>{t("recent.empty")}</div>
      ) : (
        <ul style={s.list}>
          {runs.map((r) => {
            const names = listedAgentNames(r.agent_names, t("column.deletedAgent"));
            const { color, bg } = statusColor(r.status);
            return (
              <li key={r.id}>
                <Link href={`/repos/${repoId}/multi-agent/${r.id}`} style={s.row}>
                  <span style={s.text}>
                    <span style={s.head}>
                      <span style={s.prNum}>#{r.pr_number}</span>
                      {r.pr_title ? ` · ${r.pr_title}` : ""}
                    </span>
                    <span style={s.agents}>
                      {r.agent_count > MAX_LISTED_AGENTS
                        ? t("recent.agentsCount", { count: r.agent_count })
                        : names.join(", ")}
                    </span>
                  </span>
                  <span style={s.side}>
                    <span style={s.status(color, bg)}>{t(`overallStatus.${r.status}`)}</span>
                    <span>{formatRunDuration(r.total_duration_ms)}</span>
                    <span>
                      {formatCostUsd(r.total_cost_usd)}
                      {r.total_cost_partial && (
                        <span title={t("page.costPartial")} aria-label={t("page.costPartial")}>
                          +
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default RecentRuns;
