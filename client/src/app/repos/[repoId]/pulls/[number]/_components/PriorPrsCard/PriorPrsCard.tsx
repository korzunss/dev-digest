/* PriorPrsCard — collapsible panel: merged PRs that touched the same files as
   this one. Forge support is partial, so `unsupported` / `unavailable` each get
   their own copy. Rendered inside the Blast radius card. */
"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Avatar, Badge, Icon, Skeleton } from "@devdigest/ui";
import type { Repo } from "@/lib/types";
import { forgePrUrl } from "@/lib/forge-urls";
import { usePrHistory } from "@/lib/hooks/blast";
import { s } from "./styles";

interface Props {
  prId: string | null | undefined;
  headSha: string | null | undefined;
  repo: Repo | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

export function PriorPrsCard({ prId, headSha, repo }: Props) {
  const t = useTranslations("blast");
  const [open, setOpen] = useState(true);
  const { data, isLoading, isError } = usePrHistory(prId, headSha);

  const items = data && data.status === "ok" ? data.history : [];
  let body: React.ReactNode;
  if (isLoading) body = <div style={s.message}><Skeleton height={40} /></div>;
  else if (isError || !data) body = <div role="alert" style={{ ...s.message, ...s.errorLine }}>{t("history.loadError")}</div>;
  else if (data.status === "unsupported") body = <div style={{ ...s.message, ...s.muted }}>{t("history.unsupported")}</div>;
  else if (data.status === "unavailable") body = <div style={{ ...s.message, ...s.muted }}>{t("history.unavailable")}</div>;
  else if (items.length === 0) body = <div style={{ ...s.message, ...s.muted }}>{t("history.empty")}</div>;
  else {
    body = items.map((h, i) => (
      <div key={h.pr_number} style={i === 0 ? s.itemFirst : s.item}>
        <div style={s.rail}>
          <span style={s.bullet} />
          <span style={s.line} />
        </div>
        <div style={s.content}>
          <div style={s.titleRow}>
            {repo ? (
              <a style={s.link} href={forgePrUrl(repo, h.pr_number)} target="_blank" rel="noreferrer">
                #{h.pr_number}
              </a>
            ) : (
              <span style={s.link}>#{h.pr_number}</span>
            )}
            <span style={s.title}>{h.title}</span>
          </div>
          <div style={s.metaRow}>
            <Avatar name={h.author} size={18} />
            <span>{h.author}·{formatDate(h.merged_at)}</span>
          </div>
          {h.notes && <div style={s.notes}>{h.notes}</div>}
        </div>
      </div>
    ));
  }

  return (
    <div style={s.panel}>
      <button
        type="button"
        style={s.header}
        aria-expanded={open}
        title={t("history.toggle")}
        onClick={() => setOpen(!open)}
      >
        <Icon.History size={16} />
        <span>{t("history.title")}</span>
        {items.length > 0 && <Badge>{items.length}</Badge>}
        <Icon.ChevronDown size={16} style={open ? s.chevronOpen : s.chevron} />
      </button>
      {open && <div style={s.body}>{body}</div>}
    </div>
  );
}
