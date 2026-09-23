/* AgentCard — model chip, skills count, enabled toggle. Stats are an A5 mount;
   we render the provider/model + skill count here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfirmModal } from "@/components/confirm-modal";
import { useDeleteAgent } from "../../../../lib/hooks/agents";
import { modelColor } from "./helpers";
import { s } from "./styles";

export function AgentCard({
  ag,
  active,
  skillCount,
  onClick,
  onToggle,
}: {
  ag: Agent;
  active?: boolean;
  skillCount?: number;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("agents");
  const del = useDeleteAgent();
  const color = modelColor(ag.model);
  const [confirming, setConfirming] = React.useState(false);
  return (
    <div onClick={onClick} style={s.card(!!active, ag.enabled)}>
      {confirming && (
        // Rendered from the card, but the Modal primitive is position:fixed over
        // the whole viewport — it is not laid out inside this grid cell.
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmModal
            title={t("list.deleteTitle")}
            body={t("list.deleteConfirm", { name: ag.name })}
            confirmLabel={t("list.delete")}
            pending={del.isPending}
            onClose={() => setConfirming(false)}
            onConfirm={() => del.mutate(ag.id, { onSuccess: () => setConfirming(false) })}
          />
        </div>
      )}
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Cpu size={15} />
        </div>
        <span style={s.name}>{ag.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={ag.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          disabled={del.isPending}
          title={t("list.delete")}
          aria-label={t("list.delete")}
          style={{
            background: "none",
            border: "none",
            cursor: del.isPending ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
            display: "inline-flex",
            padding: 4,
          }}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.description}>{ag.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <span className="mono" style={s.modelChip(color)}>
          {ag.model}
        </span>
        {skillCount != null && (
          <Badge color="var(--text-secondary)" icon="Sparkles">
            {t("card.skillCount", { count: skillCount })}
          </Badge>
        )}
      </div>
    </div>
  );
}
