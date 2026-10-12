/* CaseInputTabs — the case's frozen input in three tabs: the editable unified
   diff (with a DiffViewer preview), the files it covers, and the PR meta. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { EvalCaseSource, EvalPrMeta, PrFile } from "@devdigest/shared";
import { DiffViewer } from "@/components/diff-viewer";
import { DIFF_ROWS, INPUT_TABS, type InputTab } from "./constants";
import { sourceLinks } from "./helpers";
import { s } from "./styles";

export function CaseInputTabs({
  diff,
  onDiff,
  files,
  prMeta,
  source,
}: {
  diff: string;
  onDiff: (v: string) => void;
  /** Derived from `diff` by the parent, so the three tabs never disagree. */
  files: PrFile[];
  prMeta: EvalPrMeta | null;
  source: EvalCaseSource | null;
}) {
  const t = useTranslations("eval.modal");
  const [tab, setTab] = React.useState<InputTab>("diff");
  const tabs = INPUT_TABS.map((k) => ({ key: k, label: t(`tabs.${k}`) }));
  const links = sourceLinks(source);

  return (
    <div>
      <Tabs tabs={tabs} value={tab} onChange={(k) => setTab(k as InputTab)} pad="0" />
      <div style={s.tabBody}>
        {tab === "diff" ? (
          <>
            <textarea
              aria-label={t("diffLabel")}
              style={s.textarea}
              rows={DIFF_ROWS}
              spellCheck={false}
              value={diff}
              onChange={(e) => onDiff(e.target.value)}
            />
            <div style={s.preview}>
              {files.length === 0 ? <div style={s.muted}>{t("diffPreviewEmpty")}</div> : <DiffViewer files={files} />}
            </div>
          </>
        ) : tab === "files" ? (
          files.length === 0 ? (
            <div style={s.muted}>{t("filesEmpty")}</div>
          ) : (
            <ul style={s.list}>
              {files.map((f) => (
                <li key={f.path} className="mono">
                  {f.path}
                </li>
              ))}
            </ul>
          )
        ) : (
          <div>
            {prMeta ? (
              <div style={s.metaRow}>
                <div>
                  {t("prMetaRepo")}: {prMeta.repo}
                </div>
                <div>
                  {t("prMetaPr")}: #{prMeta.pr_number}
                </div>
                <div>
                  {t("prMetaTitle")}: {prMeta.title}
                </div>
                <div>
                  {t("prMetaSha")}: <span className="mono">{prMeta.head_sha}</span>
                </div>
              </div>
            ) : (
              <div style={s.muted}>{t("prMetaNone")}</div>
            )}
            {source && (
              <div style={s.links}>
                {links ? (
                  <>
                    <Link href={links.pr}>{t("sourcePr")}</Link>
                    {links.finding && <Link href={links.finding}>{t("sourceFinding")}</Link>}
                  </>
                ) : (
                  <span style={s.muted}>{t("sourceUnavailable")}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
