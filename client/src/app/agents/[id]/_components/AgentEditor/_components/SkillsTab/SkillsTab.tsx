/* SkillsTab — attach, detach and reorder the skills an agent runs with.

   The list shows EVERY skill in the workspace; the checkbox is the attachment,
   and attached ones float to the top in their stored order. That order is the
   order of the blocks in the assembled prompt, which is why it is editable at
   all — and why every change posts the whole ordered id list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "../../../../../../../lib/hooks/skills";
import { TYPE_COLOR } from "../../../../../../skills/_components/SkillCard";
import { attachedIds, filterRows, moveId, orderedRows, toggleAttachment } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const ts = useTranslations("skills");
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const { data: links } = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();

  const [search, setSearch] = React.useState("");
  const [dragging, setDragging] = React.useState<string | null>(null);

  const attached = attachedIds(links);
  const rows = filterRows(orderedRows(skills ?? [], attached), search);

  const commit = (skillIds: string[]) => setSkills.mutate({ agentId: agent.id, skillIds });

  const move = (id: string, delta: number) => {
    const from = attached.indexOf(id);
    if (from === -1) return;
    commit(moveId(attached, from, from + delta));
  };

  const dropOn = (targetId: string) => {
    if (!dragging || dragging === targetId) return;
    const from = attached.indexOf(dragging);
    const to = attached.indexOf(targetId);
    if (from === -1 || to === -1) return;
    commit(moveId(attached, from, to));
  };

  if (isLoading) return <Skeleton height={180} />;
  if (isError) return <ErrorState body={ts("page.loadError")} onRetry={() => refetch()} />;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.title}>{t("skills.title")}</span>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: attached.length, total: skills?.length ?? 0 })}
        </Badge>
        <span style={s.spacer} />
        <div style={s.filter}>
          <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <div style={s.hint}>{t("skills.orderHint")}</div>

      {rows.length === 0 ? (
        <div style={s.empty}>{ts("page.empty.title")}</div>
      ) : (
        <div style={s.list}>
          {rows.map((skill) => {
            const isAttached = attached.includes(skill.id);
            return (
              <div
                key={skill.id}
                draggable={isAttached}
                onDragStart={() => setDragging(skill.id)}
                onDragEnd={() => setDragging(null)}
                onDragOver={(e) => {
                  if (isAttached && dragging) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOn(skill.id);
                  setDragging(null);
                }}
                style={s.row(isAttached, dragging === skill.id)}
              >
                {/* A drag handle alone is unreachable without a pointer, so the
                    same control moves the row with the arrow keys. */}
                <button
                  type="button"
                  disabled={!isAttached}
                  aria-label={`Reorder ${skill.name}`}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      move(skill.id, -1);
                    }
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      move(skill.id, 1);
                    }
                  }}
                  style={s.handle(isAttached)}
                >
                  <Icon.ChevronsUpDown size={14} />
                </button>

                <Checkbox
                  checked={isAttached}
                  onChange={() => commit(toggleAttachment(attached, skill.id))}
                />

                <span className="mono" style={s.name}>
                  {skill.name}
                </span>

                {!skill.enabled && <span style={s.muted}>{ts("preview.disabled")}</span>}
                <Badge color={TYPE_COLOR[skill.type]}>{ts(`listItem.type.${skill.type}`)}</Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
