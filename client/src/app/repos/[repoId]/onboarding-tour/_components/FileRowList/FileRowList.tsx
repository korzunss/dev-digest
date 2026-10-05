/* FileRowList — path + reason + "Open" rows, in the server's order. Used by
   Critical paths (bullets) and, with `ordered`, by the reading path. The reason
   is the model's text, else a deterministic wording built from the graph data
   the server sent (rank, importers, chain) — AC-5, 6, 31. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingFileRow } from "@devdigest/shared";
import { forgeBlobUrl, type ForgeRepoRef } from "@/lib/forge-urls";
import { s } from "./styles";

export function FileRowList({
  rows,
  repo,
  builtSha,
  ordered = false,
}: {
  rows: OnboardingFileRow[];
  repo: ForgeRepoRef | null;
  /** Commit the tour was built from; null ⇒ no stable blob to link to. */
  builtSha: string | null;
  ordered?: boolean;
}) {
  const t = useTranslations("onboarding");

  const reasonOf = (row: OnboardingFileRow): string | null => {
    if (row.reason) return row.reason;
    if (row.rank_position != null && row.importers != null) {
      return t("reasons.rankImporters", { rank: row.rank_position, count: row.importers });
    }
    if (row.chain.length > 0) return t("reasons.headsChain", { chain: row.chain.join(" → ") });
    return null;
  };

  const List = ordered ? "ol" : "ul";
  return (
    <List style={s.list}>
      {rows.map((row, i) => {
        const reason = reasonOf(row);
        return (
          <li key={row.path} style={s.row}>
            {ordered && <span style={s.index}>{i + 1}.</span>}
            <div style={s.main}>
              <code className="mono" style={s.path}>
                {row.path}
              </code>
              {reason && <span style={s.reason}>{reason}</span>}
            </div>
            {builtSha && repo && (
              <a
                href={forgeBlobUrl(repo, builtSha, row.path)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${t("actions.open")} ${row.path}`}
                style={s.open}
              >
                {t("actions.open")}
                <Icon.ExternalLink size={12} />
              </a>
            )}
          </li>
        );
      })}
    </List>
  );
}
