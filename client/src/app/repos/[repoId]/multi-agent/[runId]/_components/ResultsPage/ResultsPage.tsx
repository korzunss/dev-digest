/* ResultsPage — the results of one multi-agent run (spec 013, AC-30…AC-35, 52,
   55, 56). The run is loaded by id and polled while a column runs. The view
   mode is local state; the open trace drawer lives in the address (`?trace=`)
   and is honoured only for a run id that is one of this run's columns. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import RunTraceDrawer from "@/components/run-trace-drawer";
import { ApiError } from "@/lib/api";
import { useMultiAgentRun } from "@/lib/hooks/multi-agent";
import { ColumnsView } from "../ColumnsView";
import { DisagreeBlock } from "../DisagreeBlock";
import { ResultsHeader, type ResultsView } from "../ResultsHeader";
import { TabsView } from "../TabsView";
import { s } from "./styles";

export function ResultsPage({ repoId, runId }: { repoId: string; runId: string }) {
  const t = useTranslations("runs");
  const router = useRouter();
  const search = useSearchParams();
  const query = useMultiAgentRun(runId);
  const [view, setView] = React.useState<ResultsView>("columns");

  if (query.isLoading) {
    return (
      <div style={s.page}>
        <div style={s.loading}>
          <Skeleton height={32} />
          <Skeleton height={260} />
        </div>
      </div>
    );
  }
  if (query.isError || !query.data) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div style={s.page}>
        {notFound ? (
          <EmptyState icon="Layers" title={t("page.notFound")} />
        ) : (
          <ErrorState
            body={query.error instanceof ApiError ? query.error.message : undefined}
            onRetry={() => query.refetch()}
          />
        )}
      </div>
    );
  }

  const run = query.data;
  const base = `/repos/${repoId}/multi-agent/${runId}`;
  const traceId = search.get("trace");
  const traced = run.columns.find((c) => c.run_id === traceId) ?? null;

  const configure = () => {
    router.push(
      `/repos/${repoId}/multi-agent${run.pr_number != null ? `?pr=${encodeURIComponent(String(run.pr_number))}` : ""}`,
    );
  };
  const openTrace = (id: string) => router.replace(`${base}?trace=${encodeURIComponent(id)}`);
  const closeTrace = () => router.replace(base);

  return (
    <div style={s.page}>
      <ResultsHeader run={run} view={view} onViewChange={setView} onConfigure={configure} />
      {view === "columns" && <ColumnsView columns={run.columns} onViewTrace={openTrace} />}
      {view === "tabs" && <TabsView runId={run.id} columns={run.columns} onViewTrace={openTrace} />}
      <DisagreeBlock conflicts={run.conflicts} />
      {traced && (
        <RunTraceDrawer
          key={traced.run_id}
          runId={traced.run_id}
          agentName={traced.agent_name}
          prNumber={run.pr_number ?? null}
          findings={traced.findings}
          running={traced.status === "running"}
          endedAt={traced.finished_at}
          onClose={closeTrace}
        />
      )}
    </div>
  );
}

export default ResultsPage;
