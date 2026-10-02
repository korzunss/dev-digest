"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import { blastStats } from "./helpers";
import { s } from "./styles";

export function BlastSummary({ data }: { data: BlastRadius }) {
  const t = useTranslations("blast");
  const stats = blastStats(data);
  const items = [
    ["symbols", stats.symbols],
    ["callers", stats.callers],
    ["endpoints", stats.endpoints],
    ["crons", stats.crons],
  ] as const;
  return (
    <div style={s.stats}>
      {items.map(([key, n]) => (
        <div key={key}>
          <span style={s.statValue}>{n}</span>
          <span style={s.statLabel}>{t(`stat.${key}`)}</span>
        </div>
      ))}
    </div>
  );
}
