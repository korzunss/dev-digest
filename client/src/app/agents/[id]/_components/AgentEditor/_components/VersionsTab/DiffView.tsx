/* DiffView — one stored version against the agent's current config, in a modal.
   Everything the server sent (prompt, names, values) renders as a text node:
   no Markdown, no HTML, no links. The diff is fetched only once the modal
   mounts, i.e. after Diff was clicked. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Modal, Skeleton } from "@devdigest/ui";
import type { AgentVersionDiff } from "@devdigest/shared";
import { useAgentVersionDiff } from "@/lib/hooks/agents";
import { parsePatch } from "@/components/diff-viewer/helpers";
import { CodeLine } from "@/components/diff-viewer/CodeLine";
import { DIFF_WIDTH } from "./constants";
import { fieldLabelKey, formatFieldValue } from "./helpers";
import { SkillRefLabel } from "./SkillRefLabel";
import { s } from "./styles";

function SkillGroup({ label, skills }: { label: string; skills: AgentVersionDiff["skills"]["added"] }) {
  if (skills.length === 0) return null;
  return (
    <div>
      <div style={s.heading}>{label}</div>
      {skills.map((sk) => (
        <div key={sk.id} style={s.skillRow}>
          <SkillRefLabel skill={sk} />
        </div>
      ))}
    </div>
  );
}

function SkillOrder({ skills }: { skills: AgentVersionDiff["skills"]["from"] }) {
  return (
    <>
      {skills.map((sk, i) => (
        <span key={sk.id}>
          {i > 0 && ", "}
          <SkillRefLabel skill={sk} />
        </span>
      ))}
    </>
  );
}

function DiffBody({ diff, agentName }: { diff: AgentVersionDiff; agentName: string }) {
  const t = useTranslations("agents");
  const lines = React.useMemo(() => parsePatch(diff.prompt_patch), [diff.prompt_patch]);
  const { skills } = diff;
  const skillsChanged = skills.added.length > 0 || skills.removed.length > 0 || skills.order_changed;
  return (
    <>
      {!diff.config_available && <div style={s.muted}>{t("versions.configUnavailable")}</div>}
      {diff.identical && diff.config_available && <div style={s.muted}>{t("versions.identical")}</div>}
      {lines.length > 0 && (
        <div>
          <div style={s.heading}>{t("versions.promptHeading")}</div>
          {lines.map((ln, i) => (
            <CodeLine key={i} ln={ln} path={agentName} threads={[]} />
          ))}
        </div>
      )}
      {diff.fields.length > 0 && (
        <div>
          <div style={s.heading}>{t("versions.fieldsHeading")}</div>
          {diff.fields.map((f) => {
            const labelKey = fieldLabelKey(f.field);
            return (
            <div key={f.field} style={s.fieldRow}>
              <span style={s.fieldLabel}>{labelKey ? t(`versions.field.${labelKey}`) : f.field}</span>
              <span style={s.value}>{formatFieldValue(f.from)}</span>
              <span aria-hidden>→</span>
              <span style={s.value}>{formatFieldValue(f.to)}</span>
            </div>
            );
          })}
        </div>
      )}
      {skillsChanged && (
        <div>
          <div style={s.heading}>{t("versions.skillsHeading")}</div>
          <SkillGroup label={t("versions.added")} skills={skills.added} />
          <SkillGroup label={t("versions.removed")} skills={skills.removed} />
          {skills.order_changed && (
            <div style={s.muted}>
              {t("versions.orderChanged")}: <SkillOrder skills={skills.from} /> <span aria-hidden>→</span>{" "}
              <SkillOrder skills={skills.to} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function DiffView({
  agentId,
  agentName,
  from,
  to,
  onClose,
}: {
  agentId: string;
  agentName: string;
  from: number;
  to: number;
  onClose: () => void;
}) {
  const t = useTranslations("agents");
  const diff = useAgentVersionDiff(agentId, from);
  return (
    <Modal width={DIFF_WIDTH} title={t("versions.diffTitle", { from, to })} onClose={onClose}>
      <div style={s.diffBody}>
        {diff.isLoading ? (
          <Skeleton height={140} />
        ) : diff.isError || !diff.data ? (
          <ErrorState body={t("versions.loadError")} onRetry={() => diff.refetch()} />
        ) : (
          <DiffBody diff={diff.data} agentName={agentName} />
        )}
      </div>
    </Modal>
  );
}
