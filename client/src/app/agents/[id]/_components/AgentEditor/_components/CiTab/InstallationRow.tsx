/* InstallationRow — one repo the agent is exported to. Every state is derived
   from the server's view (state, pr_state, out_of_date, gate_drift, latest_run);
   nothing is stored here. Repo and PR URL render as text / a rel-guarded link. */
"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Badge, Icon, IconBtn } from "@devdigest/ui";
import type { CiFailOn, CiInstallationView } from "@devdigest/shared";
import { gateDriftOf, statusTone } from "./helpers";
import { s } from "./styles";

const TONE = {
  ok: { color: "var(--ok)", bg: "var(--ok-bg)" },
  warn: { color: "var(--warn)", bg: "var(--warn-bg)" },
  crit: { color: "var(--crit)", bg: "var(--crit-bg)" },
} as const;

export function InstallationRow({
  installation: i,
  agentFailOn,
  now,
  onRemove,
}: {
  installation: CiInstallationView;
  agentFailOn: CiFailOn;
  /** The clock for relative ages, passed down so a render never reads it. */
  now: Date;
  onRemove: (i: CiInstallationView) => void;
}) {
  const t = useTranslations("ci");
  const ta = useTranslations("agents");
  const format = useFormatter();
  const drift = gateDriftOf(i, agentFailOn);
  const run = i.latest_run;
  const tone = run ? TONE[statusTone(run.status)] : null;
  // Only an https link is rendered as one; anything else stays inert text.
  const prLink = i.pr_url && /^https:\/\//.test(i.pr_url) ? i.pr_url : null;

  return (
    <div style={s.rowWrap}>
      <div style={s.row(i.state === "inactive")}>
        <Icon.GitBranch size={16} />
        <span className="mono" style={s.repo}>
          {i.repo}
        </span>
        {i.state !== "active" && (
          <Badge color="var(--warn)" bg="var(--warn-bg)">
            {t(`ciTab.state.${i.state}`)}
          </Badge>
        )}
        {i.out_of_date && (
          <Badge color="var(--warn)" bg="var(--warn-bg)">
            {t("ciTab.outOfDate")}
          </Badge>
        )}
        {i.pr_state !== "none" && <Badge>{t(`ciTab.prState.${i.pr_state}`)}</Badge>}
        {prLink && (
          <a href={prLink} target="_blank" rel="noopener noreferrer" style={s.link}>
            {t("ciTab.viewPr")}
          </a>
        )}
        <span style={s.spacer} />
        <div style={s.meta}>
          <Badge icon="Workflow">{t("ciTab.githubActions")}</Badge>
          {run && tone ? (
            <>
              <Badge dot color={tone.color} bg={tone.bg}>
                {t(`ciTab.runStatus.${run.status}`)}
              </Badge>
              <span className="tnum" style={s.time}>
                {Number.isNaN(Date.parse(run.ran_at)) ? "" : format.relativeTime(new Date(run.ran_at), now)}
              </span>
            </>
          ) : (
            <span style={s.time}>{t("ciTab.noRuns")}</span>
          )}
          <IconBtn icon="Trash" label={t("ciTab.remove.action")} size={26} danger onClick={() => onRemove(i)} />
        </div>
      </div>
      {i.state === "inactive" && <div style={s.note}>{t("ciTab.inactiveHint")}</div>}
      {i.state === "pending_merge" && <div style={s.note}>{t("ciTab.pendingHint")}</div>}
      {i.out_of_date && <div style={s.note}>{t("ciTab.outOfDateHint")}</div>}
      {drift && (
        <div style={s.note}>
          {t("ciTab.gateDrift", {
            exported: ta(`config.ciFailOnOptions.${drift.exported}`),
            current: ta(`config.ciFailOnOptions.${drift.current}`),
          })}
        </div>
      )}
    </div>
  );
}
