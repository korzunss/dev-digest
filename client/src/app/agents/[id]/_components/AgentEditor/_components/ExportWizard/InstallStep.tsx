/* Install step — open the export PR, or hand the files over as a zip. Shows the
   outcome in place: the PR link, the zip notice, or a mapped refusal. */
"use client";

import type React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { CiInstallResult } from "@devdigest/shared";
import { DOCS_URL, ZIP_FALLBACK_CODES } from "./constants";
import { errorKeyOf, foreignCommitOf, shortDateOf, type InstallMode } from "./helpers";
import { s } from "./styles";

/** Only an https link is rendered as an anchor; anything else would be text. */
const safeHref = (url: string | null): string | null => (url && url.startsWith("https://") ? url : null);

export function InstallStep({
  repo,
  fileCount,
  mode,
  onMode,
  result,
  errorCode,
  errorDetails,
  errorMessage,
  failed,
  pending,
  onZipInstead,
}: {
  repo: string;
  fileCount: number;
  mode: InstallMode;
  onMode: (mode: InstallMode) => void;
  result: CiInstallResult | undefined;
  errorCode: string | undefined;
  /** The server's `details` (untrusted); `foreign_commits` carries the blocking commit. */
  errorDetails?: unknown;
  /** The server's message; shown for a refused workflow (names the field) or a repo that runs another agent (names it). */
  errorMessage?: string;
  failed: boolean;
  pending: boolean;
  onZipInstead: () => void;
}) {
  const t = useTranslations("ci");
  const prUrl = safeHref(result?.pr_url ?? null);

  const code = (chunks: React.ReactNode) => <code>{chunks}</code>;
  const errorBody = (): React.ReactNode => {
    if (errorCode === "missing_workflow_permission") {
      return t.rich("exportWizard.errors.missing_workflow_permission", {
        code,
        tokens: (chunks) => (
          <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" style={s.link}>{chunks}</a>
        ),
        keys: (chunks) => (
          <Link href="/settings/api-keys" style={s.link}>{chunks}</Link>
        ),
      });
    }
    if (errorCode === "foreign_commits") {
      const info = foreignCommitOf(errorDetails);
      if (!info || (!info.truncated && !info.sha)) return t("exportWizard.errors.foreign_commits");
      const branchUrl = safeHref(info.branchUrl);
      const branch = (chunks: React.ReactNode) =>
        branchUrl ? (
          <a href={branchUrl} target="_blank" rel="noopener noreferrer" style={s.link}>{chunks}</a>
        ) : (
          chunks
        );
      if (info.truncated) return t.rich("exportWizard.errors.foreign_commits_truncated", { code, branch });
      return t.rich("exportWizard.errors.foreign_commits_detail", {
        code,
        branch,
        sha: info.sha ?? "",
        hasAuthor: info.author ? "yes" : "no",
        author: info.author ?? "",
        hasDate: info.date ? "yes" : "no",
        date: info.date ? shortDateOf(info.date) : "",
        hasSubject: info.subject ? "yes" : "no",
        subject: info.subject ?? "",
        ahead: info.aheadCount,
      });
    }
    return t(`exportWizard.errors.${errorKeyOf(errorCode)}`);
  };

  if (result) {
    return (
      <div style={s.body}>
        <div role="status" style={s.notice("info")}>
          {result.zip_base64 ? (
            t("exportWizard.zipDownloaded")
          ) : (
            <>
              {t("exportWizard.installedPr")}{" "}
              {prUrl ? (
                <a href={prUrl} target="_blank" rel="noopener noreferrer" style={s.link}>
                  {t("exportWizard.viewPr")}
                </a>
              ) : (
                result.pr_url
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={s.body}>
      <button type="button" style={s.option(mode === "open_pr")} aria-pressed={mode === "open_pr"} onClick={() => onMode("open_pr")}>
        <span style={s.optionHead}>
          <Icon.GitPullRequest size={16} />
          <span style={{ flex: 1 }}>{t("exportWizard.installCardTitle")}</span>
          <Badge color="var(--accent-text)" bg="var(--accent-bg)">{t("exportWizard.recommended")}</Badge>
        </span>
        <span style={s.cardDesc}>{t("exportWizard.installCardBody", { repo, count: fileCount })}</span>
      </button>
      <button type="button" style={s.option(mode === "zip")} aria-pressed={mode === "zip"} onClick={() => onMode("zip")}>
        <span style={s.optionHead}>
          <Icon.Copy size={16} />
          <span style={{ flex: 1 }}>{t("exportWizard.installZipTitle")}</span>
          <span style={{ ...s.muted, fontWeight: 400 }}>{t("exportWizard.installZipHint")}</span>
        </span>
        {mode === "zip" && <span style={s.cardDesc}>{t("exportWizard.installZipBody", { count: fileCount })}</span>}
      </button>

      {failed && (
        <div role="alert" style={s.notice("err")}>
          {errorBody()}
          {(errorCode === "workflow_invalid" || errorCode === "repo_has_other_agent") && errorMessage && <div>{errorMessage}</div>}
          {errorCode && ZIP_FALLBACK_CODES.includes(errorCode) && (
            <div style={{ marginTop: 8 }}>
              <Button kind="secondary" icon="Copy" onClick={onZipInstead} disabled={pending}>
                {t("exportWizard.downloadZipInstead")}
              </Button>
            </div>
          )}
        </div>
      )}

      <div style={s.help}>
        {t("exportWizard.helpPrefix")}{" "}
        <a href={DOCS_URL} target="_blank" rel="noopener noreferrer" style={s.link}>
          {t("exportWizard.helpLink")} →
        </a>
      </div>
    </div>
  );
}
