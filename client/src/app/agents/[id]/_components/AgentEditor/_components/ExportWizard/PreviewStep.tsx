/* Preview step — the files an export would create. Only the workflow is editable
   (a plain textarea); every file is rendered as text, never as HTML. */
"use client";

import { useTranslations } from "next-intl";
import { Badge, ErrorState, Icon, Skeleton, Textarea } from "@devdigest/ui";
import type { CiFile, CiPreview, CiWorkflowCheck } from "@devdigest/shared";
import { workflowFileOf } from "./helpers";
import { s } from "./styles";

/** Errors (the server's refusal, naming the field) block the Continue button. */
export function CheckIssues({ check }: { check: CiWorkflowCheck | null }) {
  const t = useTranslations("ci");
  if (!check || check.errors.length === 0) return null;
  const line = (i: CiWorkflowCheck["errors"][number]) =>
    `${i.invariant}: ${i.message}${i.line !== undefined ? ` (${t("exportWizard.issueLine", { line: i.line })})` : ""}`;
  return (
    <div role="alert" style={s.notice("err")}>
      <strong>{t("exportWizard.workflowInvalid")}</strong>
      {check.errors.map((i, n) => (
        <div key={n}>{line(i)}</div>
      ))}
    </div>
  );
}

export function PreviewStep({
  preview,
  isLoading,
  isError,
  selectedPath,
  onSelect,
  workflowText,
  onEdit,
  check,
  updating,
}: {
  preview: CiPreview | undefined;
  isLoading: boolean;
  isError: boolean;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  /** The workflow as the user currently sees it (edited or generated). */
  workflowText: string;
  onEdit: (text: string) => void;
  check: CiWorkflowCheck | null;
  updating: boolean;
}) {
  const t = useTranslations("ci");
  if (isLoading) return <div style={s.body}><Skeleton height={300} /></div>;
  if (isError || !preview) return <div style={s.body}><ErrorState body={t("exportWizard.previewLoadError")} /></div>;
  if (preview.blocked) return <div style={s.body}><div role="alert" style={s.notice("err")}>{preview.blocked.message}</div></div>;

  const workflow = workflowFileOf(preview.files);
  const current: CiFile | undefined = preview.files.find((f) => f.path === selectedPath) ?? workflow ?? preview.files[0];
  const editable = current !== undefined && current === workflow;

  return (
    <div style={s.body}>
      {updating && <div style={s.notice("info")}>{t("exportWizard.updateNote")}</div>}
      <div style={s.files}>
        <div style={s.fileList}>
          <div style={s.fileHead}>{t("exportWizard.filesToCreate")}</div>
          {preview.files.map((f) => (
            <button key={f.path} type="button" className="mono" style={s.fileBtn(f.path === current?.path)} onClick={() => onSelect(f.path)}>
              <Icon.FileText size={14} />
              {f.path}
            </button>
          ))}
        </div>
        <div style={s.viewer}>
          <div style={s.viewerHead}>
            <span className="mono" style={{ flex: 1 }}>{current?.path}</span>
            <Badge>{editable ? t("exportWizard.editable") : t("exportWizard.generated")}</Badge>
          </div>
          {editable ? (
            <div style={{ padding: 10, overflow: "auto", flex: 1 }}>
              <Textarea mono rows={14} value={workflowText} onChange={onEdit} />
            </div>
          ) : (
            <pre className="mono" style={s.code}>{current?.contents}</pre>
          )}
        </div>
      </div>
      {editable && <div style={s.muted}>{t("exportWizard.workflowEditNote")}</div>}
      <CheckIssues check={check} />
    </div>
  );
}
