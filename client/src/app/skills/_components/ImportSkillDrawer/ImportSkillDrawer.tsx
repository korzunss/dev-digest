/* ImportSkillDrawer — import a skill from a .md file, a .zip archive, or a URL.

   Two phases, deliberately: the server PARSES and returns what it would store,
   and only the confirm button creates the row. So closing this drawer after a
   preview leaves nothing behind, and "saved only after confirmation" is a
   property of the API rather than of this component remembering to ask.

   Whatever is imported lands DISABLED. A foreign skill is foreign instructions
   inside an agent's prompt, and the only thing between the two is someone
   reading the body — which is what the preview below is for. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, FormField, Icon, Markdown, Tabs, TextInput } from "@devdigest/ui";
import type { Skill, SkillImportPreview } from "@devdigest/shared";
import { ApiError } from "../../../../lib/api";
import {
  useCreateSkill,
  useImportSkillPreview,
  type ImportSkillInput,
} from "../../../../lib/hooks/skills";
import { TYPE_COLOR } from "../SkillCard";
import { ACCEPTED, fileToImportInput } from "./helpers";
import { s } from "./styles";

export type ImportTab = "file" | "url";

export function ImportSkillDrawer({
  initialTab = "file",
  onClose,
  onImported,
}: {
  initialTab?: ImportTab;
  onClose: () => void;
  onImported?: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const preview = useImportSkillPreview();
  const create = useCreateSkill();

  const [tab, setTab] = React.useState<ImportTab>(initialTab);
  const [url, setUrl] = React.useState("");
  const [filename, setFilename] = React.useState<string | null>(null);
  const [parsed, setParsed] = React.useState<SkillImportPreview | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const reset = () => {
    setParsed(null);
    setFilename(null);
    setError(null);
  };

  const runPreview = (input: ImportSkillInput) => {
    setError(null);
    preview.mutate(input, {
      onSuccess: (p) => {
        setParsed(p);
        setName(p.name);
        setDescription(p.description);
      },
      onError: (e) => setError(e instanceof ApiError ? e.message : t("drawer.importFailed")),
    });
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setFilename(file.name);
    const input = await fileToImportInput(file);
    if (!input) {
      setError(t("import.unsupported"));
      return;
    }
    runPreview(input);
  };

  const confirm = async () => {
    if (!parsed) return;
    if (name.trim() === "") return setError(t("import.nameRequired"));
    if (description.trim() === "") return setError(t("import.descriptionRequired"));

    const skill = await create.mutateAsync({
      name: name.trim(),
      description: description.trim(),
      type: parsed.type,
      body: parsed.body,
      source: parsed.source,
    });
    onClose();
    onImported?.(skill);
  };

  return (
    <Drawer
      title={t("drawer.title")}
      subtitle={t("drawer.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {parsed && (
            <Button kind="ghost" onClick={reset}>
              {t("import.back")}
            </Button>
          )}
          <Button
            kind="primary"
            icon="Check"
            onClick={confirm}
            disabled={!parsed || create.isPending}
          >
            {create.isPending ? t("import.saving") : t("import.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.tabsBar}>
        <Tabs
          tabs={[
            { key: "file", label: t("drawer.tabs.file"), icon: "Upload" },
            { key: "url", label: t("drawer.tabs.url"), icon: "Link" },
          ]}
          value={tab}
          onChange={(k) => {
            setTab(k as ImportTab);
            reset();
          }}
          pad="0 24px"
        />
      </div>

      <div style={s.body}>
        {!parsed && tab === "file" && (
          <div style={s.picker}>
            <Icon.Upload size={20} />
            <span style={s.pickerLabel}>{t("import.chooseFile")}</span>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED}
              style={s.hiddenInput}
              onChange={(e) => void onPick(e.target.files?.[0])}
            />
            <Button
              kind="secondary"
              size="sm"
              onClick={() => fileInput.current?.click()}
              disabled={preview.isPending}
            >
              {preview.isPending ? t("import.reading") : t("import.chooseFileCta")}
            </Button>
            {filename && <span style={s.filename}>{t("import.selected", { filename })}</span>}
          </div>
        )}

        {!parsed && tab === "url" && (
          <>
            <FormField label={t("url.label")} hint={t("url.hint")}>
              <TextInput value={url} onChange={setUrl} placeholder={t("url.placeholder")} mono />
            </FormField>
            <Button
              kind="secondary"
              icon="Globe"
              onClick={() => runPreview({ kind: "url", url: url.trim() })}
              disabled={url.trim() === "" || preview.isPending}
            >
              {preview.isPending ? t("url.fetching") : t("url.import")}
            </Button>
          </>
        )}

        {error && <div style={s.error}>{error}</div>}

        {parsed && (
          <>
            <div style={s.previewCard}>
              <div style={s.previewTitle}>{t("import.previewTitle")}</div>
              <div style={s.previewHint}>{t("import.previewHint")}</div>
              <FormField label={t("create.fields.name")} required>
                <TextInput value={name} onChange={setName} mono />
              </FormField>
              <div style={{ height: 12 }} />
              <FormField
                label={t("create.fields.description")}
                hint={t("create.fields.descriptionHint")}
                required
              >
                <TextInput value={description} onChange={setDescription} />
              </FormField>
              <div style={{ height: 12 }} />
              <Badge color={TYPE_COLOR[parsed.type]}>{t(`listItem.type.${parsed.type}`)}</Badge>
            </div>

            <div>
              <div style={s.sectionLabel}>{t("file.bodyLabel")}</div>
              <div style={s.bodyBox}>
                <Markdown>{parsed.body}</Markdown>
              </div>
            </div>

            {parsed.ignored.length > 0 && (
              <div>
                <div style={s.sectionLabel}>
                  {t("import.ignoredTitle", { count: parsed.ignored.length })}
                </div>
                <div style={s.ignoredBox}>
                  {parsed.ignored.map((entry) => (
                    <div key={entry} style={s.ignoredItem}>
                      <Icon.File size={12} />
                      <span className="mono">{entry}</span>
                    </div>
                  ))}
                  <div style={s.ignoredHint}>{t("import.ignoredHint")}</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
