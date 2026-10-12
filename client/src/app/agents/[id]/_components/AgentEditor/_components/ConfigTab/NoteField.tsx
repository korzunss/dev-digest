"use client";

import { useTranslations } from "next-intl";
import { FormField, TextInput } from "@devdigest/ui";
import { AGENT_NOTE_MAX } from "../../constants";
import { s } from "./styles";

/** Optional note stored on the version a Config save creates. */
export function NoteField({
  value,
  onChange,
  tooLong,
}: {
  value: string;
  onChange: (v: string) => void;
  tooLong: boolean;
}) {
  const t = useTranslations("agents");
  return (
    <FormField label={t("config.note")} hint={t("config.noteHint")}>
      <TextInput
        value={value}
        onChange={onChange}
        aria-label={t("config.note")}
        aria-invalid={tooLong}
      />
      {tooLong && (
        <div role="alert" style={s.noteError}>
          {t("config.noteTooLong", { max: AGENT_NOTE_MAX })}
        </div>
      )}
    </FormField>
  );
}
