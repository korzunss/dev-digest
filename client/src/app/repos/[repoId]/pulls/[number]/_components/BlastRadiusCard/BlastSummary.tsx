"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { BlastRadius } from "@devdigest/shared";
import { blastStats } from "./helpers";
import { s } from "./styles";

export function BlastSummary({ data }: { data: BlastRadius }) {
  const t = useTranslations("blast");
  const stats = blastStats(data);
  const items = [
    ["symbols", stats.symbols, Icon.Code],
    ["callers", stats.callers, Icon.CornerDownRight],
    ["endpoints", stats.endpoints, Icon.Globe],
    ["crons", stats.crons, Icon.Clock],
  ] as const;
  return (
    <div style={s.stats}>
      {items.map(([key, n, I]) => (
        <div key={key} style={s.stat}>
          <I size={15} />
          <span style={s.statValue}>{n}</span>
          <span style={s.statLabel}>{t(`stat.${key}`, { count: n })}</span>
        </div>
      ))}
    </div>
  );
}
