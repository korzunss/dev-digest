/* ConventionsHeader — the top of /repos/:repoId/conventions: which repo was
   scanned, how much of it the model was shown, when that happened, and the
   button that runs it again. The drop tally sits here rather than on the list
   because it is a fact about the SCAN, not about any candidate that survived —
   "three rules cited code we could not find" is the answer to "why is this list
   shorter than I expected". */
"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { ConventionScan } from "@devdigest/shared";
import { droppedCount, scanAge } from "./helpers";
import { s } from "./styles";

export function ConventionsHeader({
  repoName,
  scan,
  scanning,
  onRescan,
}: {
  repoName: string;
  scan: ConventionScan | null;
  scanning?: boolean;
  onRescan?: () => void;
}) {
  const t = useTranslations("conventions");
  const locale = useLocale();

  const dropped = droppedCount(scan);
  // `finished_at` is the moment the evidence gate ran; `created_at` is all a
  // scan that died mid-run has left.
  const when = scan ? scanAge(scan.finished_at ?? scan.created_at, locale) : null;

  return (
    <>
      <div style={s.header}>
        <div style={s.titleWrap}>
          <h1 style={s.title}>
            {t("page.headingPrefix")}
            <span className="mono" style={s.repo}>
              {repoName}
            </span>
          </h1>
          {scan ? (
            <div style={s.meta}>
              <span>{t("page.sampleCount", { count: scan.sample_paths.length })}</span>
              <span style={s.separator}>·</span>
              <span>{t("page.lastScan", { when: when ?? "" })}</span>
            </div>
          ) : (
            <p style={s.meta}>{t("page.subtitle")}</p>
          )}
        </div>
        <div style={s.actions}>
          <Button kind="secondary" icon="RefreshCw" loading={scanning} onClick={onRescan}>
            {scanning ? t("page.scanning") : scan ? t("page.rescan") : t("page.runExtraction")}
          </Button>
        </div>
      </div>
      {dropped > 0 && <div style={s.dropped}>{t("page.dropped", { count: dropped })}</div>}
    </>
  );
}
