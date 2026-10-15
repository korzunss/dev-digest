/* Configure step — triggers, the secrets the workflow expects, and how results are posted.
   A change regenerates the workflow through the preview (hand edits are dropped). */
"use client";

import { useTranslations } from "next-intl";
import { Badge, Chip } from "@devdigest/ui";
import type { CiPostAs, CiTrigger, CiWorkflowCheck } from "@devdigest/shared";
import { POST_AS_OPTIONS, TRIGGERS } from "./constants";
import { CheckIssues } from "./PreviewStep";
import { s } from "./styles";

export function ConfigureStep({
  triggers,
  postAs,
  onTrigger,
  onPostAs,
  check,
}: {
  triggers: readonly CiTrigger[];
  postAs: CiPostAs;
  onTrigger: (trigger: CiTrigger) => void;
  onPostAs: (postAs: CiPostAs) => void;
  check: CiWorkflowCheck | null;
}) {
  const t = useTranslations("ci");
  const onlyOne = triggers.length === 1;
  return (
    <div style={s.body}>
      <div>
        <div style={s.label}>{t("exportWizard.triggerLabel")}</div>
        <div style={s.chips}>
          {TRIGGERS.map((trigger) => (
            <Chip
              key={trigger}
              active={triggers.includes(trigger)}
              icon={triggers.includes(trigger) ? "Check" : undefined}
              onClick={() => onTrigger(trigger)}
            >
              {t(`exportWizard.triggers.${trigger}`)}
            </Chip>
          ))}
        </div>
        {onlyOne && <div style={{ ...s.muted, marginTop: 6 }}>{t("exportWizard.triggerMin")}</div>}
      </div>

      <div>
        <div style={s.label}>{t("exportWizard.secretsLabel")}</div>
        <div style={s.table}>
          <div style={s.secretRow}>
            <span className="mono" style={s.secretKey}>OPENROUTER_API_KEY</span>
            <span style={s.secretDesc}>{t("exportWizard.secretOpenrouterDesc")}</span>
            <Badge dot color="var(--warn)" bg="var(--warn-bg)">{t("exportWizard.secretExpected")}</Badge>
          </div>
          <div style={{ ...s.secretRow, borderBottom: "none" }}>
            <span className="mono" style={s.secretKey}>GITHUB_TOKEN</span>
            <span style={s.secretDesc}>{t("exportWizard.secretGithubDesc")}</span>
            <Badge dot color="var(--ok)" bg="var(--ok-bg)">{t("exportWizard.secretReady")}</Badge>
          </div>
        </div>
        <div style={{ ...s.muted, marginTop: 6 }}>{t("exportWizard.secretNote", { key: "OPENROUTER_API_KEY" })}</div>
      </div>

      <div role="radiogroup" aria-label={t("exportWizard.postResultsLabel")}>
        <div style={s.label}>{t("exportWizard.postResultsLabel")}</div>
        {POST_AS_OPTIONS.map((o) => (
          <label key={o.value} style={s.radio}>
            <input type="radio" name="post-as" checked={postAs === o.value} onChange={() => onPostAs(o.value)} />
            {t(`exportWizard.postAs.${o.labelKey}`)}
            {o.value === "github_review" && (
              <Badge color="var(--accent-text)" bg="var(--accent-bg)">{t("exportWizard.recommended")}</Badge>
            )}
          </label>
        ))}
      </div>

      <div style={s.notice("info")}>
        <strong>{t("exportWizard.blockMergeTitle")}.</strong> {t("exportWizard.blockMergeDesc")}
      </div>
      <CheckIssues check={check} />
    </div>
  );
}
