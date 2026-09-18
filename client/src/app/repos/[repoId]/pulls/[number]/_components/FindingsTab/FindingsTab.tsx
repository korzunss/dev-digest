"use client";

import React, { useCallback } from "react";
import { Icon, Badge, Button, SectionLabel, EmptyState } from "@devdigest/ui";
import { RunStatus } from "../RunStatus";
import { RunHistory } from "../RunHistory/RunHistory";
import { ReviewRunAccordion } from "../ReviewRunAccordion";
import { s } from "./styles";
import type {
  FindingRecord,
  ReviewRecord,
  RunSummary,
  PrCommit,
  Severity,
} from "@devdigest/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { SEVERITY_META } from "@/lib/severity";

interface FindingsTabProps {
  prId: string | null;
  liveRunIds: string[];
  reviewRunning: boolean;
  lethalTrifecta: FindingRecord[];
  runs: ReviewRecord[];
  prRuns: RunSummary[] | undefined;
  prCommits: PrCommit[];
  cancelMutation: UseMutationResult<any, any, string, any>;
  /** owner/repo + head sha — used to deep-link a finding's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  /** Severity filter from `?severity=` — null means "show everything". */
  severity: Severity | null;
  /** `?sevRun=` — when set, the filter applies to that run alone. */
  sevRun: string | null;
  onSelectSeverity: (severity: Severity | null, runId: string | null) => void;
  onOpenTrace: (id: string) => void;
  onDelete: (id: string) => void;
  onRunDone: () => void;
}

export function FindingsTab({
  prId,
  liveRunIds,
  reviewRunning,
  lethalTrifecta,
  runs,
  prRuns,
  prCommits,
  cancelMutation,
  repoFullName,
  headSha,
  severity,
  sevRun,
  onSelectSeverity,
  onOpenTrace,
  onDelete,
  onRunDone,
}: FindingsTabProps) {
  const t = useTranslations("prReview");
  const handleCancelAll = useCallback(() => {
    liveRunIds.forEach((id) => cancelMutation.mutate(id));
  }, [liveRunIds, cancelMutation]);

  const handleOpenFirstTrace = useCallback(() => {
    if (liveRunIds[0]) onOpenTrace(liveRunIds[0]);
  }, [liveRunIds, onOpenTrace]);

  const handleOpenTrace = useCallback(
    (id: string) => {
      onOpenTrace(id);
    },
    [onOpenTrace],
  );

  const handleDelete = useCallback(
    (id: string) => {
      onDelete(id);
    },
    [onDelete],
  );

  // Timeline → Review-runs navigation: clicking an agent name in the timeline
  // opens + scrolls to that run's accordion below. The nonce re-triggers the
  // scroll even when the same run is clicked twice.
  const [target, setTarget] = React.useState<{ runId: string; n: number } | null>(null);
  const handleGoToReview = useCallback((runId: string) => {
    setTarget((p) => ({ runId, n: (p?.n ?? 0) + 1 }));
  }, []);

  // The timeline's chips and its hover card both come from the reviews already
  // on this page (spec 002) — no endpoint, no stored column, and one array
  // behind both so the number and the list cannot drift apart.
  const findingsByRun = React.useMemo(() => {
    const m = new Map<string, FindingRecord[]>();
    for (const review of runs) {
      if (review.run_id) m.set(review.run_id, review.findings);
    }
    return m;
  }, [runs]);

  // A `sevRun` naming a run this PR doesn't have (stale link, hand-edited URL)
  // degrades to a page-wide filter rather than silently filtering nothing.
  const scopedRunId =
    sevRun && runs.some((r) => r.run_id === sevRun) ? sevRun : null;
  const pageFilter = severity != null && scopedRunId == null;

  /** Clicking the level already active on that same run clears the filter. */
  const handleSelectSeverity = useCallback(
    (runId: string, level: Severity) => {
      if (severity === level && scopedRunId === runId) {
        onSelectSeverity(null, null);
        return;
      }
      onSelectSeverity(level, runId);
      handleGoToReview(runId);
    },
    [severity, scopedRunId, onSelectSeverity, handleGoToReview],
  );

  // With a page-wide filter on, a run with nothing at that level is noise —
  // hide it, but say how many went. A run-scoped filter hides nothing.
  const matchingRuns = pageFilter
    ? runs.filter((r) => r.findings.some((f) => f.severity === severity && !f.dismissed_at))
    : runs;
  const hiddenRuns = runs.length - matchingRuns.length;

  const filterBar = severity && (
    <div style={s.filterBar}>
      <span style={s.filterChip(SEVERITY_META[severity].color)}>
        {scopedRunId
          ? t("severity.showingOnlyRun", { severity: t(`severity.${SEVERITY_META[severity].labelKey}`) })
          : t("severity.showingOnly", { severity: t(`severity.${SEVERITY_META[severity].labelKey}`) })}
        <button
          type="button"
          aria-label={t("severity.clearFilter")}
          title={t("severity.clearFilter")}
          onClick={() => onSelectSeverity(null, null)}
          style={s.filterClear}
        >
          <Icon.X size={12} />
        </button>
      </span>
      {hiddenRuns > 0 && (
        <span style={s.filterHint}>{t("severity.hiddenRuns", { count: hiddenRuns })}</span>
      )}
    </div>
  );

  return (
    <section>
      {liveRunIds.length > 0 && (
        <div style={s.liveRunSection}>
          <SectionLabel
            icon="Sparkles"
            right={
              <div style={s.cancelActions}>
                <Button
                  kind="danger"
                  size="sm"
                  icon="X"
                  loading={cancelMutation.isPending}
                  onClick={handleCancelAll}
                >
                  Cancel
                </Button>
                <Button kind="ghost" size="sm" icon="FileText" onClick={handleOpenFirstTrace}>
                  Open run trace
                </Button>
              </div>
            }
          >
            Live review
          </SectionLabel>
          <RunStatus runIds={liveRunIds} onDone={onRunDone} />
        </div>
      )}

      {reviewRunning && (
        <div style={s.reviewInProgress}>
          <Icon.RefreshCw size={16} style={{ color: "var(--accent)", animation: "ddspin 1s linear infinite" }} />
          <span style={s.reviewInProgressText}>Review in progress…</span>
          <span style={s.reviewInProgressSub}>
            the agent is analyzing the diff — this can take a while on large PRs.
          </span>
        </div>
      )}

      {lethalTrifecta.length > 0 && (
        <div style={s.lethalTrifecta}>
          <Icon.Shield size={16} style={{ color: "var(--crit)" }} />
          <span style={s.lethalTrifectaTitle}>Lethal Trifecta detected</span>
          <Badge color="var(--crit)" bg="transparent">
            {lethalTrifecta.length} finding(s)
          </Badge>
        </div>
      )}

      {((prRuns && prRuns.length > 0) || prCommits.length > 0) && (
        <div style={s.timelineSection}>
          <SectionLabel
            icon="Activity"
            right={<span style={{ fontSize: 12, color: "var(--text-muted)" }}>runs &amp; commits · newest first</span>}
          >
            Timeline
          </SectionLabel>
          <RunHistory
            runs={prRuns ?? []}
            commits={prCommits}
            findingsByRun={findingsByRun}
            severity={severity}
            scopedRunId={scopedRunId}
            onSelectSeverity={handleSelectSeverity}
            onOpenTrace={handleOpenTrace}
            onGoToReview={handleGoToReview}
            onDelete={handleDelete}
          />
        </div>
      )}

      <SectionLabel
        icon="AlertOctagon"
        right={<span style={{ fontSize: 12, color: "var(--text-muted)" }}>grouped by run · newest first</span>}
      >
        Review runs
      </SectionLabel>
      {filterBar}
      {runs.length === 0 ? (
        reviewRunning || liveRunIds.length > 0 ? null : (
          <EmptyState
            icon="Sparkles"
            title="No findings yet"
            body="Run a review to generate findings. Use Run Review ▾ above (run all enabled agents or a specific one)."
          />
        )
      ) : matchingRuns.length === 0 ? (
        <EmptyState icon="Filter" title="No findings match" body="No run of this PR found anything at that level." />
      ) : (
        prId &&
        matchingRuns.map((review, i) => (
          <ReviewRunAccordion
            key={review.id}
            review={review}
            prId={prId}
            // A filtered view should show its findings, not ask for another
            // click: every surviving run opens. Unfiltered, only the newest.
            defaultOpen={pageFilter || i === 0}
            // Scoped to one run ⇒ the others render untouched.
            severity={scopedRunId == null || scopedRunId === review.run_id ? severity : null}
            repoFullName={repoFullName}
            headSha={headSha}
            targetRunId={target?.runId ?? null}
            targetNonce={target?.n ?? 0}
          />
        ))
      )}
    </section>
  );
}
