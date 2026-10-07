/* SmartDiffGroup — one collapsible role group ("core", "tests", …) inside the
   Smart-order Files changed view (spec 007). The header alone carries the
   grouping's meaning (colour, label, hint, finding count); the body is a
   plain DiffViewer over the group's files. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffAnnotationApi, type DiffTarget } from "@/components/diff-viewer";
import type { PrFile, SmartDiffRole } from "@devdigest/shared";
import { ROLE_META } from "../../constants";
import { s } from "./styles";

export function SmartDiffGroup({
  role,
  files,
  findingFileCount,
  commenting,
  annotations,
  target,
}: {
  role: SmartDiffRole;
  files: PrFile[];
  findingFileCount: number;
  commenting?: DiffCommentApi;
  annotations?: DiffAnnotationApi;
  /** Only passed to the group that holds `target.path`; opens the group once per nonce. */
  target?: DiffTarget | null;
}) {
  const t = useTranslations("prReview");
  const meta = ROLE_META[role];
  const [open, setOpen] = React.useState(meta.defaultOpen);
  const bodyId = React.useId();
  const applied = React.useRef<number | null>(null);
  const nonce = target ? target.nonce : null;
  React.useEffect(() => {
    if (nonce == null || nonce === applied.current) return;
    applied.current = nonce;
    setOpen(true);
  }, [nonce]);
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <div style={s.wrap}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        style={s.header}
      >
        <Chevron size={14} style={s.chevron} />
        <span style={{ ...s.swatch, background: meta.color }} />
        <span style={s.label}>{t(`smartDiff.${meta.labelKey}`)}</span>
        <span style={s.hint}>{t(`smartDiff.${meta.hintKey}`)}</span>
        <span style={s.spacer} />
        {findingFileCount > 0 && (
          <span style={s.findingCount} aria-label={t("smartDiff.filesWithFindings", { count: findingFileCount })}>
            <span style={s.dot} />
            {findingFileCount}
          </span>
        )}
        <span style={s.filesCount}>{t("smartDiff.filesCount", { count: files.length })}</span>
      </button>
      {open && (
        <div id={bodyId} style={s.body}>
          <DiffViewer files={files} commenting={commenting} annotations={annotations} target={target} />
        </div>
      )}
    </div>
  );
}
