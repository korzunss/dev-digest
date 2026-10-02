"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { DegradedReason } from "@devdigest/shared";
import { useBlastResync } from "./useBlastResync";
import { s } from "./styles";

interface Props {
  reason: DegradedReason | null;
  repoId: string | null | undefined;
  prId: string | null | undefined;
}

export function BlastDegradedNotice({ reason, repoId, prId }: Props) {
  const t = useTranslations("blast");
  const { start, pending, failed } = useBlastResync(repoId, prId);
  return (
    <div style={s.notice}>
      <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
        {t("degraded.badge")}
      </Badge>
      {reason && <span>{t(`degraded.reason.${reason}`)}</span>}
      <Button kind="secondary" size="sm" icon="RefreshCw" loading={pending} disabled={!repoId} onClick={start}>
        {pending ? t("degraded.resyncing") : t("degraded.resync")}
      </Button>
      {failed && (
        <span role="alert" style={s.errorLine}>
          {t("degraded.resyncError")}
        </span>
      )}
    </div>
  );
}
