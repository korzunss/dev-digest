/* UnavailableNote — the "not available" stand-in for a section whose
   availability is false: the cause, the mapped reason, and the one action that
   can fix it (Re-sync for a failed index, model settings for a model failure). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { OnboardingAvailability } from "@devdigest/shared";
import { useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { FAILURE_REASON_CODES, INDEX_REASON_CODES, MODEL_SETTINGS_FAILURES } from "../../constants";
import { reasonKey } from "../../helpers";

const styles = {
  wrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 8,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies React.CSSProperties,
  reason: { color: "var(--text-tertiary)" } satisfies React.CSSProperties,
  link: { color: "var(--accent-text)", textDecoration: "underline" } satisfies React.CSSProperties,
} as const;

export function UnavailableNote({
  availability,
  repoId,
}: {
  availability: OnboardingAvailability;
  repoId: string;
}) {
  const t = useTranslations("onboarding");
  const resync = useResyncRepoIntel(repoId);
  const { cause, reason } = availability;
  if (!cause) return null;

  // The reason is a server code: index codes for a failed index, failure codes
  // for a model failure. An unknown code falls back to the generic wording.
  let reasonText: string | null = null;
  if (cause === "index_failed" && reason) {
    reasonText = t(`indexReason.${reasonKey(reason, INDEX_REASON_CODES, "other")}`);
  } else if (cause === "model_failed" && reason) {
    reasonText = t(`failure.${reasonKey(reason, FAILURE_REASON_CODES, "provider_error")}`);
  }

  return (
    <div role="status" style={styles.wrap}>
      <span>{t(`unavailable.${cause}`)}</span>
      {reasonText && <span style={styles.reason}>{reasonText}</span>}
      {cause === "index_failed" && (
        <Button
          kind="secondary"
          size="sm"
          icon="RefreshCw"
          loading={resync.isPending}
          onClick={() => resync.mutate()}
        >
          {t("actions.resync")}
        </Button>
      )}
      {cause === "model_failed" && reason && MODEL_SETTINGS_FAILURES.includes(reason) && (
        <Link href="/settings/models" style={styles.link}>
          {t("actions.settingsModels")}
        </Link>
      )}
    </div>
  );
}
