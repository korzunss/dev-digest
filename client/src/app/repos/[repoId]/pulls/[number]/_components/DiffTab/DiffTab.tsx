"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Icon, SEV, type Severity } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffAnnotationApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews, useFindingAction } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/toast";
import type { FindingActionKind, PrFile } from "@devdigest/shared";
import type { ForgeRepoRef } from "@/lib/forge-urls";
import { DiffOrderToggle, type DiffOrder } from "./_components/DiffOrderToggle";
import { SmartDiffGroup } from "./_components/SmartDiffGroup";
import { InlineFinding } from "./_components/InlineFinding";
import { diffTotals, joinGroups, latestReviewFindings, markedPaths, reviewNotRun, toAnnotations } from "./helpers";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** Currently unused — kept on purpose (S27/D19-B): the own InlineFinding
      card has no forge link, so `repo`/`headSha` are not forwarded to it. */
  repo?: ForgeRepoRef | null;
  headSha?: string | null;
}

export function DiffTab({ prId, filesCount, files, canComment, repo, headSha }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const smartDiff = useSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  const action = useFindingAction();
  // One state for both GitHub comments and inline findings (D13-C): `null`
  // means "no explicit user choice yet" — the effective visibility then
  // defaults to shown once the latest review has findings, hidden otherwise.
  const [inlineChoice, setInlineChoice] = React.useState<boolean | null>(null);
  const [order, setOrder] = React.useState<DiffOrder>("smart");

  const commentCount = comments?.length ?? 0;
  const { additions, deletions } = diffTotals(files);
  const findings = latestReviewFindings(reviews);
  const showInline = inlineChoice ?? findings.length > 0;
  const toggleCount = commentCount + findings.length;

  const annotations: DiffAnnotationApi = {
    items: toAnnotations(
      findings,
      t,
      (f) => (
        <InlineFinding
          key={f.id}
          f={f}
          onAction={(a: FindingActionKind) => action.mutate({ findingId: f.id, action: a, prId: prId ?? undefined })}
          pending={action.isPending && action.variables?.findingId === f.id}
        />
      ),
      (f) => {
        const SevIcon = Icon[SEV[f.severity as Severity].icon];
        return <SevIcon size={11} />;
      },
    ),
    markedPaths: markedPaths(smartDiff.data?.groups ?? []),
    markerLabel: t("smartDiff.hasFindings"),
    unanchoredTitle: t("smartDiff.unanchoredFindings"),
    showContent: showInline,
  };

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments: showInline,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setInlineChoice(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        // The fallback is forge-neutral on purpose: this tab serves GitLab
        // merge requests too, and the API's own message already names the
        // forge when it has one to name.
        notify.error(err instanceof Error ? err.message : t("commentFailed"));
        throw err;
      }
    },
  };

  const groups = smartDiff.data ? joinGroups(smartDiff.data.groups, files) : [];

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={s.headerRight}>
            {toggleCount > 0 ? (
              <Button
                kind="ghost"
                size="sm"
                icon={showInline ? "EyeOff" : "Eye"}
                onClick={() => setInlineChoice(!showInline)}
              >
                {t(showInline ? "smartDiff.hideComments" : "smartDiff.showComments", { count: toggleCount })}
              </Button>
            ) : undefined}
            <DiffOrderToggle value={order} onChange={setOrder} />
          </div>
        }
      >
        {t("smartDiff.header")}
        <span style={s.summary}>
          {t("smartDiff.summary", { count: filesCount, additions, deletions })}
        </span>
      </SectionLabel>

      {reviewNotRun(reviews) && <p style={s.reviewNotRun}>{t("smartDiff.reviewNotRun")}</p>}

      {order === "original" ? (
        <DiffViewer files={files} commenting={commenting} annotations={annotations} />
      ) : smartDiff.isLoading ? (
        <div style={s.loading}>{t("smartDiff.loading")}</div>
      ) : smartDiff.isError ? (
        <>
          <div style={s.unavailable}>
            {t("smartDiff.unavailable")}
          </div>
          <DiffViewer files={files} commenting={commenting} annotations={annotations} />
        </>
      ) : (
        groups.map((g) => (
          <SmartDiffGroup
            key={g.role}
            role={g.role}
            files={g.files}
            findingFileCount={g.findingFileCount}
            commenting={commenting}
            annotations={annotations}
          />
        ))
      )}
    </section>
  );
}
