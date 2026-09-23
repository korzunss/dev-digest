/* /skills/:id — the Skill editor. Rail on the left, a six-tab editor on the
   right. The tab lives in ?tab= (whitelisted against VALID_TABS) so a tab is
   linkable, survives a reload, and follows you when you switch skills. */
"use client";

import React, { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../components/app-shell";
import { ApiError } from "../../../lib/api";
import { useSkill } from "../../../lib/hooks/skills";
import { SkillsRail, layout } from "../_components/SkillsRail";
import { TYPE_COLOR } from "../_components/SkillCard";
import { SkillEditor, DEFAULT_TAB, VALID_TABS } from "./_components/SkillEditor";

export default function SkillEditorPage() {
  // `useSearchParams` forces the subtree to render on the client; without a
  // boundary `pnpm build` refuses to prerender the route.
  return (
    <Suspense fallback={null}>
      <SkillEditorRoute />
    </Suspense>
  );
}

function SkillEditorRoute() {
  const t = useTranslations("skills");
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { id } = params;

  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);

  const requested = search.get("tab") ?? "";
  const tab = VALID_TABS.includes(requested) ? requested : DEFAULT_TAB;
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("detail.crumbSkill") },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("editor.loadError")}
          body={error instanceof ApiError ? error.message : t("editor.loadErrorBody")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={layout.split}>
        <SkillsRail selectedId={id} tab={tab} />

        {isLoading || !skill ? (
          <div style={{ flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton height={24} width={240} />
            <Skeleton height={240} />
          </div>
        ) : (
          <div style={layout.pane}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "16px 28px 0",
                flexShrink: 0,
              }}
            >
              <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
              <h1 style={{ fontSize: 18, fontWeight: 700 }}>{skill.name}</h1>
              <Badge color={TYPE_COLOR[skill.type]}>{t(`listItem.type.${skill.type}`)}</Badge>
              <Badge color="var(--text-muted)" mono>
                {t("editor.versionChip", { version: skill.version })}
              </Badge>
              {!skill.enabled && <Badge color="var(--text-muted)">{t("config.disabled")}</Badge>}
              <div style={{ marginLeft: "auto" }}>
                {/* Disabled until eval sets exist — the title says why rather
                    than leaving a dead control to guess at. */}
                <Button
                  kind="secondary"
                  size="sm"
                  icon="FlaskConical"
                  disabled
                  title={t("evals.runDisabledTitle")}
                >
                  {t("evals.run")}
                </Button>
              </div>
            </div>
            <SkillEditor skill={skill} tab={tab} onTab={setTab} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
