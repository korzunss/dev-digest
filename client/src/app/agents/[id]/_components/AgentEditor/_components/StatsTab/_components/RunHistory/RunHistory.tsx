/* RunHistory — the agent's counted runs, newest first (spec 015, AC-23, AC-23a, AC-24).
   The first 50 rows load with the screen; "Load more" appends the next 50 through the
   cursor, and a failed page keeps the rows with a retry beside the button. View trace opens
   the run-trace drawer, or says there is none stored (a CI run never has one). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { RunHistoryItem } from "@devdigest/shared/contracts/agent-performance.js";
import RunTraceDrawer from "@/components/run-trace-drawer";
import { formatCostUsd } from "@/lib/format-cost";
import type { PeriodSel } from "@/lib/period";
import { useAgentRunHistory } from "@/lib/hooks/agent-performance";
import { s } from "./styles";

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-06-01 09:14" in the viewer's time zone. */
function formatStamp(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "950", "16k", "1.5k"; unknown is an em dash. */
function formatTokens(n: number | null): string {
  if (n == null) return "—";
  if (n < 1000) return String(n);
  return `${Number((n / 1000).toFixed(n < 10_000 ? 1 : 0))}k`;
}

export function RunHistory({ agentId, agentName, sel }: { agentId: string; agentName: string; sel: PeriodSel }) {
  const t = useTranslations("agentPerformance");
  const history = useAgentRunHistory(agentId, sel);
  const [open, setOpen] = React.useState<RunHistoryItem | null>(null);

  let body: React.ReactNode;
  if (history.isLoading) {
    body = <Skeleton height={160} />;
  } else if (history.isError && !history.data) {
    body = <ErrorState body={t("statsLoadError")} onRetry={() => history.refetch()} />;
  } else {
    const items = (history.data?.pages ?? []).flatMap((p) => p.items);
    body = (
      <>
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                {(["timestamp", "pr", "tokens", "cost", "findings", "source"] as const).map((col) => (
                  <th key={col} style={s.th} scope="col">
                    {t(`runHistory.${col}`)}
                  </th>
                ))}
                <th style={s.th} scope="col">
                  <span style={{ position: "absolute", left: -9999 }}>{t("runHistory.viewTrace")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td style={s.td} colSpan={7}>
                    {t("runHistory.none")}
                  </td>
                </tr>
              )}
              {items.map((run) => (
                <tr key={run.run_id}>
                  <td className="tnum" style={{ ...s.td, ...s.mono }}>
                    {formatStamp(run.ran_at)}
                  </td>
                  <td className="tnum" style={{ ...s.td, ...s.mono }}>
                    {run.pr_number != null ? <span style={s.pr}>#{run.pr_number}</span> : "—"}
                  </td>
                  <td className="tnum" style={{ ...s.td, ...s.mono }}>
                    {formatTokens(run.tokens)}
                  </td>
                  <td className="tnum" style={{ ...s.td, ...s.mono }}>
                    {formatCostUsd(run.cost_usd, run.cost_source)}
                  </td>
                  <td className="tnum" style={{ ...s.td, ...s.mono }}>
                    {run.findings_count ?? "—"}
                  </td>
                  <td style={s.td}>
                    <span style={run.source === "ci" ? s.badgeCi : s.badge}>{t(run.source === "ci" ? "runHistory.ci" : "runHistory.local")}</span>
                  </td>
                  <td style={s.td}>
                    {run.has_trace ? (
                      <button type="button" style={s.traceButton} onClick={() => setOpen(run)}>
                        {t("runHistory.viewTrace")}
                      </button>
                    ) : (
                      <span style={s.muted}>{t("runHistory.noTrace")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(history.hasNextPage || history.isFetchNextPageError) && (
          <div style={s.footer}>
            <Button kind="secondary" size="sm" disabled={history.isFetchingNextPage} onClick={() => history.fetchNextPage()}>
              {history.isFetchingNextPage ? t("runHistory.loadingMore") : t("runHistory.loadMore")}
            </Button>
            {history.isFetchNextPageError && (
              <>
                <span role="alert" style={s.error}>
                  {t("runHistory.loadMoreError")}
                </span>
                <Button kind="ghost" size="sm" onClick={() => history.fetchNextPage()}>
                  {t("retry")}
                </Button>
              </>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <section style={s.section} aria-label={t("runHistory.title")}>
      <h2 style={s.title}>
        <Icon.History size={13} />
        {t("runHistory.title")}
      </h2>
      {body}
      {open && (
        <RunTraceDrawer
          runId={open.run_id}
          agentName={agentName}
          prNumber={open.pr_number}
          endedAt={open.ran_at}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
