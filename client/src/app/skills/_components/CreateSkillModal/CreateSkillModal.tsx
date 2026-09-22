/* CreateSkillModal — name / description / type / markdown body.

   The description field is deliberately labelled and hinted as the skill's
   INTERFACE: it is the line an agent reads to decide the rule applies, so the
   hint asks for an instruction ("Reject X") rather than a summary ("About X"). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, Textarea } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useCreateSkill } from "../../../../lib/hooks/skills";
import { DEFAULT_TYPE, MODAL_WIDTH, TYPE_VALUES } from "./constants";
import { s } from "./styles";

export function CreateSkillModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);
  const [body, setBody] = React.useState("");

  const ready = name.trim() !== "" && description.trim() !== "" && body.trim() !== "";

  const submit = async () => {
    const skill = await create.mutateAsync({
      name: name.trim(),
      description: description.trim(),
      type,
      body,
    });
    onClose();
    onCreated?.(skill);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Plus"
            onClick={submit}
            disabled={!ready || create.isPending}
          >
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("create.fields.name")} required>
          <TextInput
            value={name}
            onChange={setName}
            placeholder={t("create.fields.namePlaceholder")}
            mono
          />
        </FormField>
        <FormField
          label={t("create.fields.description")}
          hint={t("create.fields.descriptionHint")}
          required
        >
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("create.fields.descriptionPlaceholder")}
          />
        </FormField>
        <FormField label={t("create.fields.type")}>
          <SelectInput
            value={type}
            onChange={(v) => setType(v as SkillType)}
            options={TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }))}
          />
        </FormField>
        <FormField label={t("create.fields.body")} hint={t("create.fields.bodyHint")} required>
          <Textarea
            value={body}
            onChange={setBody}
            rows={10}
            mono
            placeholder={t("create.fields.bodyPlaceholder")}
          />
        </FormField>
      </div>
    </Modal>
  );
}
