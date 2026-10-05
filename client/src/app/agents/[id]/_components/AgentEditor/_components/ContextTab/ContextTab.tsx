/* Agent ContextTab — the project-context documents this agent carries into a
   prompt, on top of the shared `ContextDocPicker`.

   Owns what is agent-specific: which mutation a change calls, and which
   documents arrive through the agent's enabled skills (shown read-only — they
   are detached on the skill, not here). Documents are per-REPO, so the tab
   follows the shell's active repo. The container fetches; the picker renders. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ContextDocPicker, attachedPaths } from "@/components/context-doc-picker";
import { useAgentContext, useSetAgentContext } from "@/lib/hooks/agents";
import { useActiveRepo } from "@/lib/repo-context";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { repoId } = useActiveRepo();
  const { data: context, isLoading, isError, refetch } = useAgentContext(agent.id);
  const setContext = useSetAgentContext();

  // No repo selected is its own nothing — it must not read as "no documents".
  if (!repoId) {
    return <EmptyState icon="FileText" title={t("context.noRepo.title")} body={t("context.noRepo.body")} />;
  }

  // Until the stored links are known the picker must not be usable: a toggle
  // would send `[the one path]` and overwrite every link not yet loaded.
  if (isLoading) return <Skeleton height={180} />;
  if (isError) return <ErrorState body={t("context.loadError")} onRetry={() => refetch()} />;

  const inherited = (context?.inherited ?? []).map((d) => ({ path: d.path, skillName: d.skill_name }));

  return (
    <ContextDocPicker
      repoId={repoId}
      attached={attachedPaths(context?.links)}
      onChange={(paths) => setContext.mutate({ id: agent.id, paths })}
      inherited={inherited}
      hint={t("context.hint")}
      saveFailed={setContext.isError}
    />
  );
}
