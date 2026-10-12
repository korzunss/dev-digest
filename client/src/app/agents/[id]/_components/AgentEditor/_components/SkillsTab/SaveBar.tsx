"use client";

import { useTranslations } from "next-intl";
import { Button, TextInput } from "@devdigest/ui";
import { AGENT_NOTE_MAX } from "../../constants";
import { s } from "./styles";

/** Footer shown while skill edits are staged: optional note, Cancel, Save. */
export function SaveBar({
  note,
  onNote,
  noteTooLong,
  pending,
  onCancel,
  onSave,
}: {
  note: string;
  onNote: (v: string) => void;
  noteTooLong: boolean;
  pending: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useTranslations("agents");
  return (
    <div style={s.footer}>
      <span style={s.unsaved}>{t("skills.unsaved")}</span>
      <div style={s.noteWrap}>
        <TextInput
          value={note}
          onChange={onNote}
          placeholder={t("skills.note")}
          aria-label={t("skills.note")}
          aria-invalid={noteTooLong}
        />
        {noteTooLong && (
          <div role="alert" style={s.noteError}>
            {t("skills.noteTooLong", { max: AGENT_NOTE_MAX })}
          </div>
        )}
      </div>
      <Button kind="ghost" onClick={onCancel} disabled={pending}>
        {t("skills.cancel")}
      </Button>
      <Button kind="primary" icon="Check" onClick={onSave} disabled={pending || noteTooLong}>
        {pending ? t("skills.saving") : t("skills.save")}
      </Button>
    </div>
  );
}
