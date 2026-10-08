/* ContextTab — the project-context documents this skill carries into a prompt.

   The list, ordering, filter and preview are the shared `ContextDocPicker`
   (also the agent editor's Context tab); this tab owns what is skill-specific:
   which mutation a change calls, the "used by N agents" figure, and the box
   that shows how the attached documents reach the prompt.

   Documents are per-REPO (a link stores a path, and a path only means
   something inside one repo), so the tab follows the shell's active repo. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ContextDocPicker, attachedPaths } from "@/components/context-doc-picker";
import { useSetSkillContext, useSkillContext } from "@/lib/hooks/skills";
import { useActiveRepo } from "@/lib/repo-context";
import { CONTEXT_HEADING } from "./constants";
import { untrustedMarker } from "./helpers";
import { s } from "./styles";

export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { repoId } = useActiveRepo();

  const { data: context, isLoading, isError, refetch } = useSkillContext(skill.id);
  const setContext = useSetSkillContext();
  const attached = attachedPaths(context?.links);

  // No repo selected is its own nothing — it must not read as "no documents".
  if (!repoId) {
    return <EmptyState icon="FileText" title={t("context.noRepo.title")} body={t("context.noRepo.body")} />;
  }

  // Until the stored links are known the picker must not be usable: a toggle
  // would send `[the one path]` and overwrite every link not yet loaded.
  if (isLoading) return <Skeleton height={180} />;
  if (isError) return <ErrorState body={t("context.loadError")} onRetry={() => refetch()} />;

  return (
    <div style={s.wrap}>
      <ContextDocPicker
        repoId={repoId}
        attached={attached}
        onChange={(paths) => setContext.mutate({ id: skill.id, paths })}
        hint={t("context.hint")}
        saveFailed={setContext.isError}
        extraHeader={
          context ? (
            <Badge color="var(--text-secondary)">
              {t("context.usedBy", { count: context.used_by_agents })}
            </Badge>
          ) : null
        }
      />

      {/* What the prompt actually gets. The heading is the engine's real one
          and each line names a document, followed by the delimiter its FULL
          text is wrapped in — the box summarises which documents are sent, and
          the marker is what stops that summary reading as "paths only". */}
      <div style={s.box}>
        <div style={s.boxLabel}>{t("context.serializesAs")}</div>
        {attached.length === 0 ? (
          <div style={s.boxEmpty}>{t("context.empty.title")}</div>
        ) : (
          <div className="mono" style={s.code}>
            <div style={s.heading}>{CONTEXT_HEADING}</div>
            {attached.map((p) => (
              <div key={p} style={s.codeRow}>
                <span style={s.path}>{`- ${p}`}</span>
                <span style={s.marker}>{untrustedMarker(p)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
