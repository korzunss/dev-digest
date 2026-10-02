"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { BlastRadius, DownstreamImpact } from "@devdigest/shared";
import { forgeBlobUrl, type ForgeRepoRef } from "@/lib/forge-urls";
import { symbolLabel } from "./helpers";
import { s } from "./styles";

interface Props {
  impact: DownstreamImpact;
  symbol: BlastRadius["changed_symbols"][number] | undefined;
  cap: number;
  defaultOpen: boolean;
  headSha: string | null | undefined;
  repo: ForgeRepoRef | null;
}

function Chips({ items, kind }: { items: string[]; kind: "endpoint" | "cron" }) {
  if (items.length === 0) return null;
  const Ico = kind === "endpoint" ? Icon.Globe : Icon.Clock;
  return (
    <div style={s.chips}>
      {items.map((x) => (
        <span key={x} style={kind === "endpoint" ? s.chipEndpoint : s.chipCron}>
          <Ico size={14} />
          <span>{x}</span>
        </span>
      ))}
    </div>
  );
}

export function BlastSymbolNode({ impact: d, symbol, cap, defaultOpen, headSha, repo }: Props) {
  const t = useTranslations("blast");
  // Only the user's override is stored; the default is derived.
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? defaultOpen;
  const label = symbolLabel(d.symbol, symbol?.kind);

  return (
    <div style={s.node}>
      <button
        type="button"
        style={s.nodeButton}
        aria-expanded={open}
        aria-label={`${open ? t("collapse") : t("expand")}: ${label}`}
        onClick={() => setOverride(!open)}
      >
        {open ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
        <Icon.Code size={15} style={s.symbolIcon} />
        <span style={s.symbolName}>{label}</span>
        <span style={s.callerCount}>
          {t("callerCount", { count: d.callers.length })}
          {d.callers.length >= cap && ` · ${t("topN", { count: cap })}`}
        </span>
      </button>
      {open && (
        <div style={s.nodeBody}>
          <div style={s.guide}>
            {d.callers.map((c) => {
              const deep = c.depth === 2;
              const text = `${c.file}:${c.line}`;
              return (
                <div
                  key={`${c.file}:${c.line}:${c.name}`}
                  style={deep ? s.callerRowDeep : s.callerRow}
                  title={deep && c.via ? t("depth2", { name: c.via }) : c.name}
                >
                  <Icon.CornerDownRight size={14} />
                  {repo && headSha ? (
                    <a style={s.link} href={forgeBlobUrl(repo, headSha, c.file, c.line)} target="_blank" rel="noreferrer">
                      {text}
                    </a>
                  ) : (
                    <span style={s.link}>{text}</span>
                  )}
                </div>
              );
            })}
          </div>
          <Chips items={d.endpoints_affected} kind="endpoint" />
          <Chips items={d.crons_affected} kind="cron" />
        </div>
      )}
    </div>
  );
}
