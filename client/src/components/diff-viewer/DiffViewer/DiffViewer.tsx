/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import { type DiffAnnotationApi } from "../annotations";
import { s } from "../styles";
import { FileCard } from "../FileCard";
import type { DiffTarget } from "../target";

export function DiffViewer({
  files,
  commenting,
  annotations,
  target,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  annotations?: DiffAnnotationApi;
  /** Navigation request: opens the matching file and scrolls to the line. */
  target?: DiffTarget | null;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f, i) => (
        <FileCard key={i} file={f} commenting={commenting} annotations={annotations} target={target} />
      ))}
    </div>
  );
}
