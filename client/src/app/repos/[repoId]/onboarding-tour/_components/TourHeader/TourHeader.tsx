/* TourHeader — title, "Will use provider · model", Generate/Regenerate, Share
   link, and the banners (stale index, last failure, index status). */
"use client";

import React from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { OnboardingTourView } from "@devdigest/shared";
import { useToast } from "@/lib/toast";
import { FAILURE_REASON_CODES, INDEX_REASON_CODES, MODEL_SETTINGS_FAILURES } from "../../constants";
import { coverageLabel, reasonKey, shareUrl, tourAge } from "../../helpers";
import { s } from "./styles";

export function TourHeader({
  repoName,
  view,
  pending,
  onGenerate,
}: {
  repoName: string;
  view: OnboardingTourView;
  /** The POST is in flight (before the server reports `generating`). */
  pending: boolean;
  onGenerate: () => void;
}) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const toast = useToast();

  const busy = view.generating || pending;
  const { index, tour, model, last_failure: failure } = view;
  const coverage = index.coverage_partial ? coverageLabel(index.files_indexed, index.source_files_total) : null;
  const age = tourAge(tour.generated_at, locale);
  const generateLabel = busy ? t("actions.generating") : view.stored ? t("actions.regenerate") : t("actions.generate");

  const share = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl(window.location.origin, view.repo_id));
      toast.success(t("actions.linkCopied"));
    } catch {
      toast.error(t("actions.copyFailed"));
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.top}>
        <div style={s.titleWrap}>
          <h1 style={s.title}>{t("title", { repo: repoName })}</h1>
          <div style={s.meta}>
            {coverage ? (
              <span>
                {t("header.coverage", coverage)}
                {index.partial_cause && ` (${t(`partialCause.${index.partial_cause}`)})`}
              </span>
            ) : (
              view.stored && (
                <span>{t("header.subtitle", { count: tour.index_files, age: age ?? "—" })}</span>
              )
            )}
            {index.status !== "full" && (
              <Badge color="var(--warn)">
                {t(`indexStatus.${index.status}`)}
                {index.reason && ` · ${t(`indexReason.${reasonKey(index.reason, INDEX_REASON_CODES, "other")}`)}`}
              </Badge>
            )}
          </div>
        </div>
        <div style={s.actions}>
          <span style={s.willUse}>{t("header.willUse", { provider: model.provider, model: model.model })}</span>
          <Button kind="secondary" icon="Link" onClick={share}>
            {t("actions.shareLink")}
          </Button>
          <Button kind="primary" icon="Sparkles" loading={busy} disabled={busy} onClick={onGenerate}>
            {generateLabel}
          </Button>
        </div>
      </div>

      {view.stale && (
        <div role="status" style={s.stale}>
          <span>{t("header.stale")}</span>
          <Button kind="secondary" size="sm" icon="RefreshCw" disabled={busy} onClick={onGenerate}>
            {t("actions.regenerate")}
          </Button>
        </div>
      )}

      {failure && (
        <div role="alert" style={s.failure}>
          <strong>{t(`failure.${reasonKey(failure.reason, FAILURE_REASON_CODES, "provider_error")}`)}</strong>
          {failure.message && <span style={s.failureMsg}>{failure.message}</span>}
          {MODEL_SETTINGS_FAILURES.includes(failure.reason) && (
            <Link href="/settings/models" style={s.link}>
              {t("actions.settingsModels")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
