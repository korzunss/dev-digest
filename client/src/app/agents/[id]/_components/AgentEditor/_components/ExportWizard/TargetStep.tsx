/* Target step — pick where it runs and which repo. Only GitHub Actions works; the
   other cards are shown disabled. The repo is chosen among the connected GitHub repos. */
"use client";

import { useTranslations } from "next-intl";
import { Badge, Icon, SelectInput } from "@devdigest/ui";
import type { Repo } from "@devdigest/shared";
import { TARGETS } from "./constants";
import { s } from "./styles";

export function TargetStep({
  repos,
  repoId,
  onRepo,
  alreadyInstalled,
  providerBlocked,
  provider,
}: {
  repos: readonly Repo[];
  repoId: string | null;
  onRepo: (id: string) => void;
  alreadyInstalled: boolean;
  providerBlocked: boolean;
  provider: string;
}) {
  const t = useTranslations("ci");
  return (
    <div style={s.body}>
      <div style={s.grid} role="radiogroup" aria-label={t("exportWizard.targetLabel")}>
        {TARGETS.map((target) => {
          const I = Icon[target.icon];
          return (
            <button
              key={target.key}
              type="button"
              role="radio"
              aria-checked={target.enabled}
              aria-disabled={!target.enabled}
              disabled={!target.enabled}
              title={target.enabled ? undefined : t("exportWizard.targetSoon")}
              style={s.card(target.enabled, !target.enabled)}
            >
              <span style={s.cardHead}>
                <span style={s.cardIcon}>
                  <I size={16} />
                </span>
                <span style={{ flex: 1 }}>{t(`exportWizard.targets.${target.key}`)}</span>
                {target.enabled && (
                  <Badge color="var(--accent-text)" bg="var(--accent-bg)">
                    {t("exportWizard.recommended")}
                  </Badge>
                )}
              </span>
              <span style={s.cardDesc}>{t(`exportWizard.targets.${target.key}Desc`)}</span>
            </button>
          );
        })}
      </div>

      <div>
        <div style={s.label}>{t("exportWizard.repoLabel")}</div>
        {repos.length === 0 ? (
          <div style={s.notice("warn")}>{t("exportWizard.noGithubRepo")}</div>
        ) : (
          <div style={s.select}>
            <SelectInput
              value={repoId ?? ""}
              onChange={onRepo}
              options={repos.map((r) => ({ value: r.id, label: r.full_name }))}
            />
          </div>
        )}
      </div>

      {alreadyInstalled && <div style={s.notice("info")}>{t("exportWizard.existingNote")}</div>}
      {providerBlocked && <div style={s.notice("err")}>{t("exportWizard.providerBlocked", { provider })}</div>}
    </div>
  );
}
