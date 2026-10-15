/* CiRunsView — the CI Runs page: agent reviews that ran inside CI, newest
   first (AC-52). Filters live in the URL; paging is "Load more" on next_cursor;
   ingest errors and rejections sit in a banner above the rows (AC-51). */
"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { CiRefreshResult } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useAgents } from "@/lib/hooks/agents";
import { useRepos } from "@/lib/hooks/core";
import { useCiRefresh, useCiRuns, type CiRunsFilter } from "@/lib/hooks/ci";
import { CiRunRow } from "./CiRunRow";
import { CiRunsFilters } from "./CiRunsFilters";
import { parseFilters, sinceFor, type Filters, type Range } from "./helpers";
import { s } from "./styles";

const PAGE_SIZE = 25;

/** The rows of every loaded page, one list; "Load more" fetches the next page. */
function RunsList({ filter }: { filter: CiRunsFilter<Range> }) {
  const t = useTranslations("ci.runs");
  const { data, isLoading, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useCiRuns(filter, sinceFor);

  if (isLoading) return <Skeleton height={44} />;
  if (isError || !data) return <ErrorState body={t("loadError")} onRetry={() => refetch()} />;

  return (
    <>
      {data.pages.flatMap((page) => page.items).map((run) => (
        <CiRunRow key={run.id} run={run} />
      ))}
      {hasNextPage && (
        <div style={s.more}>
          <Button kind="secondary" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {t("loadMore")}
          </Button>
        </div>
      )}
    </>
  );
}

function RefreshBanner({ result }: { result: CiRefreshResult | undefined }) {
  const t = useTranslations("ci.runs");
  if (!result || (result.rejected.length === 0 && result.errors.length === 0)) return null;
  return (
    <div style={s.banner} role="alert">
      {result.errors.map((e, i) => (
        <span key={`e${i}`}>{t("bannerError", { repo: e.repo, message: e.message })}</span>
      ))}
      {result.rejected.map((r, i) => (
        <span key={`r${i}`}>{t("bannerRejected", { repo: r.repo, run: r.run_id, reason: r.reason })}</span>
      ))}
    </div>
  );
}

export function CiRunsView() {
  const t = useTranslations("ci.runs");
  const tp = useTranslations("ci.page");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const filters = parseFilters((k) => search.get(k));
  const { data: agents } = useAgents();
  const { data: repos } = useRepos();
  const refresh = useCiRefresh({ agent_id: null });

  // The range key (not a timestamp) is in the query key; `since` is computed at fetch time.
  const filter: CiRunsFilter<Range> = {
    range: filters.range,
    agent_id: filters.agent || undefined,
    repo: filters.repo || undefined,
    status: filters.status || undefined,
    limit: PAGE_SIZE,
  };

  const setFilters = (patch: Partial<Record<keyof Filters, string>>) => {
    const next = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const first = useCiRuns(filter, sinceFor);
  const empty = first.data?.pages[0]?.items.length === 0;
  const filtered = !!(filters.agent || filters.repo || filters.status);

  return (
    <AppShell crumb={[{ label: tp("crumb") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("title")}</h1>
            <p style={s.subtitle}>{t("subtitle")}</p>
          </div>
          <div style={s.headerActions}>
            <span style={s.auto}>
              <span style={s.autoDot} />
              {t("autoRefresh")}
            </span>
            <Button kind="secondary" size="sm" icon="RefreshCw" onClick={() => refresh.refetch()} disabled={refresh.isFetching}>
              {refresh.isFetching ? t("refreshing") : t("refresh")}
            </Button>
          </div>
        </div>

        <CiRunsFilters
          filters={filters}
          agents={(agents ?? []).map((a) => ({ id: a.id, name: a.name }))}
          repos={(repos ?? []).map((r) => r.full_name)}
          onChange={setFilters}
        />
        <RefreshBanner result={refresh.data} />

        <div style={s.table} role="table">
          {empty ? (
            <div style={s.empty}>
              <div style={s.emptyTitle}>{filtered ? t("noMatches") : t("emptyTitle")}</div>
              {!filtered && <div>{t("emptyBody")}</div>}
            </div>
          ) : (
            <>
              <div style={s.headRow} role="row">
                <span>{t("table.timestamp")}</span>
                <span>{t("table.pullRequest")}</span>
                <span>{t("table.source")}</span>
                <span>{t("table.findings")}</span>
                <span>{t("table.verdict")}</span>
                <span>{t("table.cost")}</span>
                <span>{t("table.duration")}</span>
                <span>{t("table.status")}</span>
                <span />
              </div>
              <RunsList filter={filter} />
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
