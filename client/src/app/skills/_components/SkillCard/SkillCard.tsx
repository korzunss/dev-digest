/* SkillCard — one row of the Skills rail: name, type chip, description, source,
   enabled toggle, vetting badge, and a footer of usage rollups. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { SOURCE_ICON, TYPE_COLOR } from "./constants";
import { formatCount, formatRate, needsVetting } from "./helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
  onDelete,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  /** Optional on purpose: the index offers Delete, the editor's rail does not —
      removing the thing you are currently editing from beside the editor is a
      different, more surprising action than removing it from a list. */
  onDelete?: () => void;
}) {
  const t = useTranslations("skills");
  const color = TYPE_COLOR[skill.type];
  const unvetted = needsVetting(skill);

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={15} />
        </div>
        <span style={s.name}>{skill.name}</span>
        {onToggle && (
          // The card navigates; the toggle must not take the page with it.
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title={t("page.delete")}
            aria-label={t("page.delete")}
            style={s.deleteBtn}
          >
            <Icon.Trash size={14} />
          </button>
        )}
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <span style={s.typeChip(color)}>{t(`listItem.type.${skill.type}`)}</span>
        <Badge color="var(--text-muted)" icon={SOURCE_ICON[skill.source]}>
          {t(`listItem.source.${skill.source}`)}
        </Badge>
        {/* The version is the body's identity — a skill that reads the same but
            sits at v7 has been rewritten six times, and that is worth seeing
            without opening it. Same chip as the editor header, deliberately. */}
        <Badge color="var(--text-muted)" mono>
          {t("editor.versionChip", { version: skill.version })}
        </Badge>
        {unvetted && (
          <span title={t("listItem.vettingTitle")} style={s.vetting}>
            <Badge color="var(--warn)" bg="var(--warn-bg)" icon="AlertTriangle">
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
      </div>
      {/* Rollups come from the LIST endpoint only, and every one of them is
          nullish: an em dash means "not measured", which "0%" would misreport
          as "measured, and zero". */}
      <div className="tnum" style={s.stats} title={t("listItem.stats.title")}>
        {t("listItem.stats.line", {
          agents: formatCount(skill.agent_count),
          pull: formatRate(skill.pull_rate),
          accept: formatRate(skill.accept_rate),
        })}
      </div>
    </div>
  );
}
