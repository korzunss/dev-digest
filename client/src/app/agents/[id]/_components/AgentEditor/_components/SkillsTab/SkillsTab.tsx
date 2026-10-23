/* SkillsTab — attach, detach and reorder the skills an agent runs with.

   The list shows EVERY skill in the workspace; the checkbox is the attachment,
   and attached ones float to the top in their stored order. That order is the
   order of the blocks in the assembled prompt, which is why it is editable at
   all — and why a save posts the whole ordered id list.

   Edits are STAGED: toggles, drags and arrow keys change local state only, and
   one Save (with an optional note) posts the result, so a session of edits is
   one agent version rather than one per click. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { AGENT_NOTE_MAX } from "../../constants";
import { useAgentSkills, useSetAgentSkills, useSkills } from "../../../../../../../lib/hooks/skills";
import { TYPE_COLOR } from "../../../../../../skills/_components/SkillCard";
import { appliesToSummary } from "@/lib/skills/applies-to";
import { moveId, toggleAttachment } from "@/lib/attachment-order";
import { attachedIds, filterRows, orderedRows, sameOrder } from "./helpers";
import { SaveBar } from "./SaveBar";
import { s } from "./styles";
import { useUnsavedGuard } from "./use-unsaved-guard";

interface SkillsTabProps {
  agent: Agent;
  /** Reports whether staged edits exist. Pass a stable function (a state setter). */
  onDirtyChange?: (dirty: boolean) => void;
}

export function SkillsTab({ agent, onDirtyChange }: SkillsTabProps) {
  const t = useTranslations("agents");
  const ts = useTranslations("skills");
  const tc = useTranslations("common");
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const { data: links, isLoading: linksLoading, isError: linksError, refetch: refetchLinks } =
    useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();

  const [search, setSearch] = React.useState("");
  const [dragging, setDragging] = React.useState<string | null>(null);
  // Staged edits. AgentEditor remounts this tab with key={agent.id}, so they can
  // never be shown (or saved) against another agent; no agent id is tracked here.
  const [staged, setStaged] = React.useState<string[] | null>(null);
  const [note, setNote] = React.useState("");

  const stored = attachedIds(links);
  const attached = staged ?? stored;
  const isDirty = staged !== null && !sameOrder(staged, stored);
  const noteTooLong = note.trim().length > AGENT_NOTE_MAX;
  const rows = filterRows(orderedRows(skills ?? [], attached), search);

  useUnsavedGuard(isDirty, t("skills.leaveConfirm"));

  // `onDirtyChange` must be stable (the page passes a state setter): the effect
  // re-runs on identity change, and the cleanup would briefly report "clean".
  React.useEffect(() => {
    onDirtyChange?.(isDirty);
    // Leaving the tab drops the staged edits, so the page must not keep asking.
    return () => {
      if (isDirty) onDirtyChange?.(false);
    };
  }, [isDirty, onDirtyChange]);

  const commit = (skillIds: string[]) => setStaged(skillIds);

  const cancel = () => {
    setStaged(null);
    setNote("");
  };

  const save = () => {
    if (staged === null) return;
    const message = note.trim();
    setSkills.mutate(
      { agentId: agent.id, skillIds: staged, ...(message ? { message } : {}) },
      { onSuccess: cancel },
    );
  };

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

  // Never render controls before the stored list is known: a Save from a
  // half-loaded tab would replace every stored link.
  if (isLoading || linksLoading) return <Skeleton height={180} />;
  if (linksError) return <ErrorState body={ts("page.loadError")} onRetry={() => refetchLinks()} />;
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
        // Two different nothings. A filter that matched no skill is not a
        // workspace without any, and only the second should read as an
        // invitation to create one.
        <div style={s.empty}>
          {(skills ?? []).length === 0 ? ts("page.empty.title") : tc("states.empty")}
        </div>
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

                <span style={s.nameCol}>
                  <span className="mono" style={s.name}>
                    {skill.name}
                  </span>
                  <span className="mono" style={s.appliesTo}>
                    {appliesToSummary(skill.paths) ?? ts("appliesTo.all")}
                  </span>
                </span>

                {!skill.enabled && <span style={s.muted}>{ts("preview.disabled")}</span>}
                <Badge color={TYPE_COLOR[skill.type]}>{ts(`listItem.type.${skill.type}`)}</Badge>
              </div>
            );
          })}
        </div>
      )}

      {isDirty && (
        <SaveBar
          note={note}
          onNote={setNote}
          noteTooLong={noteTooLong}
          pending={setSkills.isPending}
          onCancel={cancel}
          onSave={save}
        />
      )}
    </div>
  );
}
