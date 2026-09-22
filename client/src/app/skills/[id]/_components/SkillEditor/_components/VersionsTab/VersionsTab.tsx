/* VersionsTab — the skill's changelog.

   A restore APPENDS: restoring v2 from v5 yields v6 carrying v2's text. It does
   not rewind, because eval runs reference versions by number and a rewritten v3
   would silently change what a scored run was scored against. The confirm copy
   says that out loud, which is why it is behind a confirm at all.

   The diff is computed server-side and rendered with the PR viewer's machinery
   (`parsePatch` + `CodeLine`) so a skill diff reads exactly like a code diff. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import {
  useRestoreSkillVersion,
  useSkillVersions,
  useVersionDiff,
} from "../../../../../../../lib/hooks/skills";
import { parsePatch } from "../../../../../../../components/diff-viewer/helpers";
import { CodeLine } from "../../../../../../../components/diff-viewer/CodeLine";
import { DIFF_WIDTH } from "./constants";
import { currentVersion, formatVersionDate } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const tc = useTranslations("common");
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();

  // The version whose diff is open. Null keeps `useVersionDiff` disabled, so
  // nothing is fetched until a Diff button is pressed.
  const [diffFrom, setDiffFrom] = React.useState<number | null>(null);

  const list = versions ?? [];
  const current = currentVersion(list);
  const diff = useVersionDiff(skill.id, diffFrom, current);
  const lines = React.useMemo(() => parsePatch(diff.data?.patch), [diff.data?.patch]);

  const onRestore = (version: number) => {
    if (!window.confirm(t("versions.restoreConfirm", { version }))) return;
    restore.mutate({
      id: skill.id,
      version,
      message: t("versions.restoreMessage", { version }),
    });
  };

  if (isLoading) return <Skeleton height={180} />;
  if (isError) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;
  if (list.length === 0) {
    return <EmptyState icon="History" title={t("versions.empty.title")} body={t("versions.empty.body")} />;
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.title}>{t("versions.title")}</span>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("versions.count", { count: list.length })}
        </Badge>
      </div>
      <div style={s.hint}>{t("versions.hint")}</div>

      <div style={s.list}>
        {list.map((v) => {
          const isCurrent = v.version === current;
          return (
            <div key={v.version} style={s.row(isCurrent)}>
              <Badge color="var(--text-muted)" mono>
                {t("preview.version", { version: v.version })}
              </Badge>
              <span style={v.message ? s.message : s.noMessage}>
                {v.message ?? t("versions.noMessage")}
              </span>
              <span className="tnum" style={s.date}>
                {formatVersionDate(v.created_at)}
              </span>
              {isCurrent ? (
                <Badge color="var(--ok)" bg="var(--ok-bg)">
                  {t("versions.current")}
                </Badge>
              ) : (
                <span style={s.actions}>
                  <Button kind="tertiary" size="sm" icon="GitCommit" onClick={() => setDiffFrom(v.version)}>
                    {t("versions.diff")}
                  </Button>
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="History"
                    disabled={restore.isPending}
                    onClick={() => onRestore(v.version)}
                  >
                    {restore.isPending ? t("versions.restoring") : t("versions.restore")}
                  </Button>
                </span>
              )}
            </div>
          );
        })}
      </div>

      {list.length === 1 && <div style={s.onlyOne}>{t("versions.empty.body")}</div>}

      {diffFrom !== null && current !== null && (
        <Modal
          width={DIFF_WIDTH}
          title={t("versions.diffTitle", { from: diffFrom, to: current })}
          onClose={() => setDiffFrom(null)}
        >
          <div style={s.diffBody}>
            {diff.isLoading ? (
              <Skeleton height={140} />
            ) : diff.isError ? (
              <ErrorState body={t("versions.loadError")} onRetry={() => diff.refetch()} />
            ) : lines.length === 0 ? (
              <div style={s.diffEmpty}>{tc("states.empty")}</div>
            ) : (
              lines.map((ln, i) => <CodeLine key={i} ln={ln} path={skill.name} threads={[]} />)
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
