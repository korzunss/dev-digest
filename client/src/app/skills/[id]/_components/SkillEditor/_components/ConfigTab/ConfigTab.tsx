/* ConfigTab — the skill form: name, description, type and the body that reaches
   the prompt. Saving a changed body appends an immutable version, so the save
   also carries an optional note describing what changed. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Icon, SelectInput, TextInput, Textarea, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { ConfirmModal } from "@/components/confirm-modal";
import { useToast } from "../../../../../../../lib/toast";
import { formatTokenEstimate } from "../../../../../../../lib/estimate-tokens";
import { needsVetting } from "../../../../../_components/SkillCard";
import { BODY_ROWS, DESCRIPTION_ROWS, TYPE_VALUES } from "./constants";
import { fileBaseName, isDirty } from "./helpers";
import { s } from "./styles";

export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [enabled, setEnabled] = React.useState(skill.enabled);
  const [message, setMessage] = React.useState("");

  /**
   * Re-sync a field when the STORED value of that field changes.
   *
   * The dependencies are the values, not the `skill` object: a background
   * refetch hands back a new object with identical contents, and depending on
   * the object would throw away whatever the user is typing every time one
   * lands. Depending on each value means a field resets only when the server's
   * version of THAT field actually moved — after a save, after a restore on the
   * Versions tab, or after the rail's toggle flipped `enabled` for the same
   * skill while this form was open. Without the last one the form keeps a stale
   * toggle and the next save writes it back, silently undoing the rail.
   */
  React.useEffect(() => setName(skill.name), [skill.name]);
  React.useEffect(() => setDescription(skill.description), [skill.description]);
  React.useEffect(() => setType(skill.type), [skill.type]);
  React.useEffect(() => setEnabled(skill.enabled), [skill.enabled]);
  React.useEffect(() => setBody(skill.body), [skill.body]);

  const unvetted = needsVetting(skill);
  const dirty = isDirty(body, skill.body);
  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`config.typeOptions.${v}`) }));

  /** Cancel = back to what is stored, including the unsaved note. */
  const reset = () => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
    setMessage("");
  };

  const save = () =>
    update.mutate(
      {
        id: skill.id,
        patch: {
          name,
          description,
          type,
          body,
          enabled,
          // Only send a note when there is one — an empty string would store a
          // blank message on the version instead of leaving it absent.
          ...(message.trim() === "" ? {} : { message: message.trim() }),
        },
      },
      {
        onSuccess: (data) => {
          setMessage("");
          toast.success(t("config.savedToast", { version: data.version }));
        },
      },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {enabled ? t("config.enabled") : t("config.disabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>

      {unvetted && (
        <div style={s.notice}>
          <Icon.AlertTriangle size={15} style={s.noticeIcon} />
          <span>{t("config.untrustedNotice")}</span>
        </div>
      )}

      <FormField label={t("config.name")} required>
        <TextInput value={name} onChange={setName} />
      </FormField>
      <FormField label={t("config.description")} hint={t("config.descriptionHint")}>
        <Textarea value={description} onChange={setDescription} rows={DESCRIPTION_ROWS} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>

      <FormField label={t("config.body")} hint={t("config.bodyHint")}>
        <div>
          <div style={s.bodyBar}>
            <span className="mono" style={s.fileChip}>
              <Icon.FileText size={13} style={s.fileIcon} />
              {t("config.fileChip", { name: fileBaseName(name) })}
            </span>
            {/* Shown only while the local body differs from the saved one —
                it is the signal that a save would create a new version. */}
            {dirty && (
              <span title={t("config.unsavedTitle")}>
                <Badge color="var(--warn)" bg="var(--warn-bg)">
                  {t("config.unsaved")}
                </Badge>
              </span>
            )}
            <span style={s.spacer} />
            {/* An ESTIMATE: there is no tokenizer in the browser, so this is
                derived from the character count and wears a `~` to say so. */}
            <span className="tnum" style={s.tokens} title={t("config.tokensTitle")}>
              {t("config.tokens", { tokens: formatTokenEstimate(body) })}
            </span>
          </div>
          <div style={s.bodyWrap}>
            <Textarea value={body} onChange={setBody} rows={BODY_ROWS} mono />
          </div>
        </div>
      </FormField>

      <FormField label={t("config.message")} hint={t("config.messageHint")}>
        <TextInput
          value={message}
          onChange={setMessage}
          placeholder={t("config.messagePlaceholder")}
        />
      </FormField>

      <div style={s.actionsRow}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        <Button kind="secondary" onClick={reset} disabled={update.isPending}>
          {t("config.cancel")}
        </Button>
        {/* What the NEXT save will do, shown while it is still avoidable —
            a receipt after the fact cannot talk you out of anything. Only a
            changed body creates a version, so the note appears only then. */}
        {dirty && (
          <span style={s.snapshotNote}>
            {t.rich("config.snapshotNote", {
              version: `v${skill.version + 1}`,
              v: (chunks) => <strong style={s.snapshotVersion}>{chunks}</strong>,
            })}
          </span>
        )}
      </div>

      {/* Below a rule and away from Save: deleting a skill is not the same kind
          of act as editing one, and the copy says what it costs elsewhere. */}
      <div style={s.dangerZone}>
        <div style={s.dangerText}>
          <div style={s.dangerTitle}>{t("config.deleteTitle")}</div>
          <div style={s.dangerBody}>{t("config.deleteBody")}</div>
        </div>
        <Button
          kind="danger"
          icon="Trash"
          disabled={del.isPending}
          onClick={() => setConfirmingDelete(true)}
        >
          {t("config.deleteAction")}
        </Button>
        {confirmingDelete && (
          <ConfirmModal
            // NOT `config.deleteTitle` / `config.deleteAction`: both are already
            // on screen in the danger zone behind this modal, and repeating them
            // inside it makes the question ambiguous to read and to query.
            title={t("page.deleteTitle")}
            body={t("page.deleteConfirm", { name: skill.name })}
            confirmLabel={t("page.delete")}
            pending={del.isPending}
            onClose={() => setConfirmingDelete(false)}
            onConfirm={() => del.mutate(skill.id, { onSuccess: () => router.push("/skills") })}
          />
        )}
      </div>
    </div>
  );
}
