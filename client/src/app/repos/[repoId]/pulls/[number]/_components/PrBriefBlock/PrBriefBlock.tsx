/* PrBriefBlock — spec 010. One "PR Brief" section laid out as designs 22/36/37:
   the verdict banner carries the brief summary and, under the PR score, the
   review and brief cost lines; a coverage block lists what the brief was built
   without; Intent and Blast sit side by side, then the Risk areas and Review
   focus cards, both full-width. Intent and Blast
   always render with their own data. Data comes from `lib/hooks/brief`;
   rendering never POSTs — only the buttons do (AC-43). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import type { Verdict } from "@devdigest/shared";
import { useGeneratePrBrief, usePrBrief } from "@/lib/hooks/brief";
import { usePrReviews, usePrRuns } from "@/lib/hooks/reviews";
import type { Repo } from "@/lib/types";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { VerdictBanner } from "../VerdictBanner";
import { CostLines } from "./_components/CostLines";
import { CoverageBlock } from "./_components/CoverageBlock";
import { FocusList } from "./_components/FocusList";
import { RiskList } from "./_components/RiskList";
import { blockerCount, isStale, latestReview, reviewUsage } from "./helpers";
import { s } from "./styles";

interface PrBriefBlockProps {
  prId: string | null | undefined;
  prHeadSha: string | null | undefined;
  repo: Repo | null;
  diffPaths: string[];
  onOpenInDiff: (path: string, line: number | null) => void;
}

export function PrBriefBlock({ prId, prHeadSha, repo, diffPaths, onOpenInDiff }: PrBriefBlockProps) {
  const t = useTranslations("brief.prBrief");
  const tb = useTranslations("brief");
  const { data: view, isLoading, isError, refetch } = usePrBrief(prId);
  const generate = useGeneratePrBrief();
  const { data: reviews } = usePrReviews(prId);
  const { data: runs } = usePrRuns(prId);
  const [notice, setNotice] = React.useState<string | null>(null);

  const busy = generate.isPending || !!view?.generating;
  const start = () => {
    if (prId) generate.mutate(prId);
  };
  const open = (path: string, line: number | null) => {
    if (!diffPaths.includes(path)) {
      setNotice(t("notInDiff"));
      return;
    }
    setNotice(null);
    onOpenInDiff(path, line);
  };

  const brief = view?.brief ?? null;
  // the skeleton / error replaces the whole brief, risk and focus cards included (AC-4)
  const shown = isLoading || busy || isError ? null : brief;
  const review = latestReview(reviews);
  const failure = view?.failure;
  const failed = failure === "failed" || generate.isError;

  return (
    <section style={s.section}>
      <div style={s.header}>
        <SectionLabel icon="Sparkles">{t("title")}</SectionLabel>
        <Button
          kind="secondary"
          size="sm"
          icon="RefreshCw"
          loading={busy}
          disabled={!prId || busy || isLoading}
          onClick={start}
        >
          {brief ? t("refresh") : t("generate")}
        </Button>
      </div>

      <div style={s.card}>
        {isLoading || busy ? (
          <Skeleton height={80} />
        ) : isError ? (
          <div role="alert" style={s.alert}>
            <Icon.AlertTriangle size={14} />
            {t("error")}
            <Button kind="secondary" size="sm" onClick={() => refetch()}>
              {t("retry")}
            </Button>
          </div>
        ) : (
          <>
            {failure === "no_key" && (
              <div role="alert" style={s.alert}>
                <Icon.AlertTriangle size={14} />
                {t("noKey")}
                <Link href="/settings/models" style={s.link}>
                  {t("openSettings")}
                </Link>
              </div>
            )}
            {failure === "over_budget" && (
              <div role="alert" style={s.alert}>
                <Icon.AlertTriangle size={14} />
                {t("overBudget")}
              </div>
            )}
            {failed && (
              <div role="alert" style={s.alert}>
                <Icon.AlertTriangle size={14} />
                {t("error")}
                <Button kind="secondary" size="sm" onClick={start}>
                  {t("retry")}
                </Button>
              </div>
            )}
            {!brief && !failure && !failed && (
              <>
                <p style={s.summary}>{tb("unavailable")}</p>
                <p style={s.muted}>{tb("unavailableHint")}</p>
              </>
            )}
            {brief && view && (
              <>
                {review?.verdict ? (
                  <VerdictBanner
                    verdict={review.verdict as Verdict}
                    summary={brief.summary}
                    score={review.score}
                    findingsCount={review.findings.length}
                    blockers={blockerCount(review)}
                    agentName={review.agent_name}
                    scoreFooter={<CostLines review={reviewUsage(review, runs)} brief={brief.usage} />}
                  />
                ) : (
                  <div style={s.summaryCard}>
                    <p style={{ ...s.summary, flex: 1 }}>{brief.summary}</p>
                    <CostLines review={null} brief={brief.usage} />
                  </div>
                )}
                {isStale(view.stale, brief.head_sha, prHeadSha) && (
                  <div style={s.note}>
                    <Icon.AlertTriangle size={14} />
                    {t("stale")}
                  </div>
                )}
                <CoverageBlock items={brief.missing_inputs} />
                {notice && (
                  <div role="status" style={s.status}>
                    {notice}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div style={s.columns}>
        <section>
          <IntentCard prId={prId} prHeadSha={prHeadSha} />
        </section>
        <section>
          <BlastRadiusCard prId={prId} headSha={prHeadSha} repo={repo} />
        </section>
      </div>

      {shown && <RiskList risks={shown.risks.risks} onOpen={open} />}
      {shown && <FocusList items={shown.review_focus} onOpen={open} />}
    </section>
  );
}
