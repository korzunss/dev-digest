/* CiRunRow — one CI run (AC-52). The PR number links to the studio PR page only
   when the PR is tracked locally (AC-66); the job link is https-only. */
"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { CiRunView } from "@devdigest/shared";
import { formatCost, formatDuration, safeHttpsUrl, statusTone } from "./helpers";
import { s, TONE } from "./styles";

// No global time zone is configured (i18n/request.ts); rows render in the viewer's own, client-side only.
const LOCAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function CiRunRow({ run }: { run: CiRunView }) {
  const t = useTranslations("ci.runs");
  const format = useFormatter();
  const tone = TONE[statusTone(run.status)];
  const job = safeHttpsUrl(run.job_url);
  const pr = run.pr_number === null ? null : `#${run.pr_number}`;

  return (
    <div style={s.row} role="row">
      <span className="mono" style={s.muted}>
        {Number.isNaN(Date.parse(run.ran_at)) ? "" : format.dateTime(new Date(run.ran_at), { dateStyle: "medium", timeStyle: "short", timeZone: LOCAL_TIME_ZONE })}
      </span>
      <span className="mono">
        {pr && run.local_pr ? (
          <Link href={`/repos/${run.local_pr.repo_id}/pulls/${run.local_pr.number}`} style={s.link}>
            {pr}
          </Link>
        ) : (
          pr
        )}
      </span>
      <div style={s.source}>
        <span style={run.agent_deleted ? { ...s.agentName, ...s.deleted } : s.agentName}>
          {run.agent_deleted ? t("deletedAgent", { name: run.agent_name }) : run.agent_name}
        </span>
        <span className="mono" style={s.repo}>
          {run.repo}
        </span>
      </div>
      <span className="tnum">{run.findings_count ?? t("findingsNone")}</span>
      <span>{run.verdict ? t(`verdict.${run.verdict}`) : <span style={s.muted}>—</span>}</span>
      <span className="tnum" style={s.muted}>
        {formatCost(run.cost_usd)}
      </span>
      <span className="tnum" style={s.muted}>
        {formatDuration(run.duration_ms) || "—"}
      </span>
      <span>
        <Badge dot color={tone.color} bg={tone.bg}>
          {t(`status.${run.status}`)}
        </Badge>
      </span>
      <span>
        {job && (
          <a href={job} target="_blank" rel="noopener noreferrer" style={s.link}>
            {t("view")}
          </a>
        )}
      </span>
    </div>
  );
}
