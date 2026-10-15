/* CiTab — where the agent runs in CI (spec 014). Data: installations + a 60 s
   refresh that pulls new runs from GitHub only while the tab is mounted (AC-57).
   The tab opens the Export Wizard; it never builds files. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useNow, useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent, CiInstallationView } from "@devdigest/shared";
import { useCiInstallations, useCiRefresh, useRemoveCiInstallation } from "@/lib/hooks/ci";
import { useToast } from "@/lib/toast";
import { ExportWizard, type CiExportRequest } from "../ExportWizard";
import { FailOnControl } from "./FailOnControl";
import { InstallationRow } from "./InstallationRow";
import { RemoveConfirm } from "./RemoveConfirm";
import { UpdatePicker } from "./UpdatePicker";
import { activeCount } from "./helpers";
import { s } from "./styles";

export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const toast = useToast();
  // One clock for every row's "4m ago", ticking once a minute.
  const now = useNow({ updateInterval: 60_000 });
  const { data, isLoading, isError, refetch } = useCiInstallations(agent.id);
  // The refresh result is not shown: it refreshes the lists through invalidation.
  useCiRefresh({ agent_id: agent.id });
  const remove = useRemoveCiInstallation();
  const [removing, setRemoving] = React.useState<CiInstallationView | null>(null);
  const [picking, setPicking] = React.useState(false);
  const [exporting, setExporting] = React.useState<CiExportRequest | null>(null);

  if (isLoading) return <Skeleton height={180} />;
  if (isError) return <ErrorState body={t("ciTab.loadError")} onRetry={() => refetch()} />;

  const list = data ?? [];
  const active = activeCount(list);
  const open = (installation: CiInstallationView | null) => setExporting({ installation });
  const onUpdate = () => (list.length === 1 ? open(list[0]!) : setPicking(true));
  const onConfirmRemove = () => {
    if (!removing) return;
    const repo = removing.repo;
    // A failure is surfaced by the global mutation error toast.
    remove.mutate(removing.id, {
      onSuccess: () => {
        setRemoving(null);
        toast.success(t("ciTab.remove.done", { repo }));
      },
    });
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.title}>{t("ciTab.heading")}</span>
        {list.length > 0 && (
          <Badge dot color="var(--ok)" bg="var(--ok-bg)">
            {t("ciTab.activeBadge", { count: active })}
          </Badge>
        )}
        <span style={s.spacer} />
        <div style={s.actions}>
          <Button kind="secondary" icon="RefreshCw" disabled={list.length === 0} onClick={onUpdate}>
            {t("ciTab.updateConfig")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={() => open(null)}>
            {t("ciTab.addToCi")}
          </Button>
        </div>
      </div>

      <FailOnControl agent={agent} />

      {list.length === 0 ? (
        <EmptyState icon="GitBranch" title={t("ciTab.emptyTitle")} body={t("ciTab.emptyBody")} />
      ) : (
        <div style={s.list}>
          {list.map((i) => (
            <InstallationRow key={i.id} installation={i} agentFailOn={agent.ci_fail_on} now={now} onRemove={setRemoving} />
          ))}
          <button type="button" style={s.addRepo} onClick={() => open(null)}>
            <Icon.Plus size={14} />
            {t("ciTab.addRepository")}
          </button>
        </div>
      )}

      {/* The vendored Modal does not portal itself; inside the scrolling editor it would be clipped. */}
      {removing &&
        createPortal(
          <RemoveConfirm
            repo={removing.repo}
            pending={remove.isPending}
            onConfirm={onConfirmRemove}
            onClose={() => setRemoving(null)}
          />,
          document.body,
        )}
      {exporting &&
        createPortal(<ExportWizard agent={agent} request={exporting} onClose={() => setExporting(null)} />, document.body)}
      {picking &&
        createPortal(
          <UpdatePicker
            installations={list}
            onPick={(i) => {
              setPicking(false);
              open(i);
            }}
            onClose={() => setPicking(false)}
          />,
          document.body,
        )}
    </div>
  );
}
