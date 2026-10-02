"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { BlastRadius, DownstreamImpact } from "@devdigest/shared";
import { forgeBlobUrl, type ForgeRepoRef } from "@/lib/forge-urls";
import { s } from "./styles";

interface Props {
  data: BlastRadius;
  headSha: string | null | undefined;
  repo: ForgeRepoRef | null;
}

function Names({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <div style={s.subLabel}>{label}</div>
      {items.map((x) => (
        <div key={x} style={s.listItem}>{x}</div>
      ))}
    </>
  );
}

export function BlastTree({ data, headSha, repo }: Props) {
  const t = useTranslations("blast");
  // Only overrides are stored; the default (first node open) is derived.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const cap = data.limits.callers_per_symbol;

  function renderNode(d: DownstreamImpact, index: number) {
    const open = overrides[d.symbol] ?? index === 0;
    return (
      <div key={d.symbol} style={s.node}>
        <button
          type="button"
          style={s.nodeButton}
          aria-expanded={open}
          aria-label={`${open ? t("collapse") : t("expand")}: ${d.symbol}`}
          onClick={() => setOverrides((o) => ({ ...o, [d.symbol]: !open }))}
        >
          {open ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
          <span>{d.symbol}</span>
          <span style={s.statLabel}>{t("callerCount", { count: d.callers.length })}</span>
          {d.callers.length >= cap && <span style={s.statLabel}>{t("topN", { count: cap })}</span>}
        </button>
        {open && (
          <div>
            {d.callers.map((c) => (
              <div key={`${c.file}:${c.line}:${c.name}`} style={s.callerRow}>
                {repo && headSha ? (
                  <a
                    style={s.link}
                    href={forgeBlobUrl(repo, headSha, c.file, c.line)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {c.file}:{c.line}
                  </a>
                ) : (
                  <span style={s.link}>{c.file}:{c.line}</span>
                )}
                <span>{c.name}</span>
                {c.depth === 2 && c.via && <span style={s.statLabel}>{t("depth2", { name: c.via })}</span>}
              </div>
            ))}
            <Names label={t("endpoints")} items={d.endpoints_affected} />
            <Names label={t("crons")} items={d.crons_affected} />
          </div>
        )}
      </div>
    );
  }

  return <div>{data.downstream.map(renderNode)}</div>;
}
