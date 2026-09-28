/* IntentCard — spec 006. The classifier's structured output for one PR:
   quoted summary, in/out of scope, confidence, sources it drew on, missing
   context, and whether it is stale against the PR's current head/description.
   Presentational bits stay in this file (small); data comes from the two
   `hooks/intent.ts` hooks — the container never fetches directly. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Skeleton, type IconName } from "@devdigest/ui";
import type { IntentSource, PrIntentRecord } from "@devdigest/shared";
import { useClassifyIntent, usePrIntent } from "@/lib/hooks";
import { cardState, staleReason } from "./helpers";
import { s } from "./styles";

const SOURCE_ICON = {
  ok: { icon: Icon.CheckCircle, color: "var(--ok)" },
  failed: { icon: Icon.XCircle, color: "var(--crit)" },
  unsupported: { icon: Icon.AlertTriangle, color: "var(--text-muted)" },
} as const;

const CONFIDENCE_COLOR = {
  high: "var(--ok)",
  medium: "var(--warn)",
  low: "var(--crit)",
} as const;

function SourceRow({ source }: { source: IntentSource }) {
  const { icon: I, color } = SOURCE_ICON[source.status];
  return (
    <div style={s.sourceRow}>
      <I size={13} style={{ color, flexShrink: 0 }} />
      <span>{source.ref}</span>
    </div>
  );
}

function ScopeList({ title, items, icon, color }: { title: string; items: string[]; icon: IconName; color: string }) {
  const I = Icon[icon];
  return (
    <div>
      <div style={s.scopeTitle}>{title}</div>
      {items.map((item, i) => (
        <div key={i} style={s.scopeItem}>
          <I size={13} style={{ color, flexShrink: 0, marginTop: 2 }} />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function IntentBody({ intent, state, stale, t }: {
  intent: PrIntentRecord;
  state: "low" | "missing" | "ok";
  stale: ReturnType<typeof staleReason>;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <>
      <div style={s.summary}>&ldquo;{intent.intent}&rdquo;</div>
      <div style={s.scopeColumns}>
        <ScopeList title={t("inScope")} items={intent.in_scope} icon="Check" color="var(--ok)" />
        <ScopeList title={t("outOfScope")} items={intent.out_of_scope} icon="X" color="var(--crit)" />
      </div>
      <div style={s.meta}>
        <Badge color={CONFIDENCE_COLOR[intent.confidence]} bg="var(--bg-hover)">
          {t(`confidence.${intent.confidence}`)}
        </Badge>
        {stale && (
          <Badge icon="RefreshCw" color="var(--warn)" bg="var(--warn-bg)">
            {t(stale === "head_moved" ? "staleHeadMoved" : "staleDescriptionChanged")}
          </Badge>
        )}
      </div>
      {state === "low" && <div style={s.warning}><Icon.AlertTriangle size={14} />{t("lowConfidence")}</div>}
      {intent.sources.length > 0 && (
        <>
          <div style={s.sourcesTitle}>{t("sourcesTitle")}</div>
          {intent.sources.map((source, i) => (
            <SourceRow key={`${source.kind}-${i}`} source={source} />
          ))}
        </>
      )}
      {state === "missing" && <div style={s.warning}><Icon.AlertTriangle size={14} />{t("missingContext")}</div>}
    </>
  );
}

/** The card body only — the caller (`OverviewTab`) owns the "PR Brief"
    `SectionLabel` above it, same as every other Overview section. */
export function IntentCard({ prId }: { prId: string | null | undefined; prHeadSha?: string | null }) {
  const t = useTranslations("brief.intentCard");
  const { data, isLoading, isError } = usePrIntent(prId);
  const classify = useClassifyIntent(prId);

  const state = cardState(data);
  const stale = staleReason(data);

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elevated)", padding: 18 }}>
      {isLoading ? (
        <Skeleton height={40} />
      ) : isError ? (
        <div role="alert" style={s.warning}>
          <Icon.AlertTriangle size={14} />
          {t("loadError")}
        </div>
      ) : state === "empty" ? (
        <div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>{t("empty")}</div>
          <div style={s.emptyHint}>{t("emptyHint")}</div>
        </div>
      ) : (
        <IntentBody intent={data!.intent!} state={state} stale={stale} t={t} />
      )}
      <div style={s.footer}>
        <Button
          kind="secondary"
          size="sm"
          icon="RefreshCw"
          loading={classify.isPending}
          disabled={!prId}
          aria-label={t("reclassify")}
          onClick={() => classify.mutate()}
        >
          {classify.isPending ? t("classifying") : t("reclassify")}
        </Button>
        {classify.isError && (
          <span role="alert" style={s.errorLine}>
            {t("error")}
          </span>
        )}
      </div>
    </div>
  );
}
