/* VersionsTab — the agent's changelog.

   A restore APPENDS: restoring v2 from v5 yields v6 carrying v2's config. It
   does not rewind, because eval runs reference versions by number. Messages are
   user-written, so they render as text nodes only. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent, AgentVersion } from "@devdigest/shared";
import { useAgentVersions, useRestoreAgentVersion } from "@/lib/hooks/agents";
import { ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { DiffView } from "./DiffView";
import { RestoreConfirm } from "./RestoreConfirm";
import { formatVersionDate } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const { data: versions, isLoading, isError, error, refetch } = useAgentVersions(agent.id);
  const restore = useRestoreAgentVersion();
  // Null keeps the diff / confirm unmounted, so nothing is fetched until a button is pressed.
  const [diffFrom, setDiffFrom] = React.useState<number | null>(null);
  const [restoring, setRestoring] = React.useState<AgentVersion | null>(null);

  if (isLoading) return <Skeleton height={180} />;
  if (isError) {
    const gone = error instanceof ApiError && error.status === 404;
    return <ErrorState body={gone ? t("versions.agentGone") : t("versions.loadError")} onRetry={gone ? undefined : () => refetch()} />;
  }

  const list = versions ?? [];

  const onConfirm = () => {
    if (!restoring) return;
    restore.mutate(
      { id: agent.id, version: restoring.version },
      {
        // A failure is surfaced by the global mutation error toast.
        onSuccess: (res) => {
          setRestoring(null);
          toast.success(t("versions.restored", { version: res.version }));
        },
      },
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.title}>{t("versions.title")}</span>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("versions.count", { count: list.length })}
        </Badge>
      </div>
      <div style={s.hint}>{t("versions.hint")}</div>

      <div style={s.list}>
        {list.map((v) => {
          const isCurrent = v.version === agent.version;
          return (
            <div key={v.version} style={s.row(isCurrent)}>
              <Badge color="var(--text-muted)" mono>
                {t("versions.version", { version: v.version })}
              </Badge>
              <span style={v.message ? s.message : s.noMessage}>{v.message ?? t("versions.noMessage")}</span>
              {v.config === null && <Badge color="var(--text-muted)">{t("versions.configUnavailable")}</Badge>}
              <span className="tnum" style={s.date}>
                {formatVersionDate(v.created_at)}
              </span>
              {isCurrent ? (
                <Badge color="var(--ok)" bg="var(--ok-bg)">
                  {t("versions.current")}
                </Badge>
              ) : (
                <span style={s.actions}>
                  <Button kind="tertiary" size="sm" icon="GitCommit" onClick={() => setDiffFrom(v.version)}>
                    {t("versions.diff")}
                  </Button>
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="History"
                    disabled={restore.isPending}
                    onClick={() => setRestoring(v)}
                  >
                    {restore.isPending ? t("versions.restoring") : t("versions.restore")}
                  </Button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {list.length === 1 && <div style={s.onlyOne}>{t("versions.onlyOne")}</div>}

      {/* The vendored Modal does not portal itself; inside the scrolling editor it would be clipped. */}
      {diffFrom !== null &&
        createPortal(
          <DiffView
            agentId={agent.id}
            agentName={agent.name}
            from={diffFrom}
            to={agent.version}
            onClose={() => setDiffFrom(null)}
          />,
          document.body,
        )}
      {restoring &&
        createPortal(
          <RestoreConfirm
            agentId={agent.id}
            version={restoring}
            pending={restore.isPending}
            onConfirm={onConfirm}
            onClose={() => setRestoring(null)}
          />,
          document.body,
        )}
    </div>
  );
}
