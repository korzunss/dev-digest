/* SkillsRail — the left column of both /skills routes: search, the "Add Skill"
   menu, and every skill as a card. The selection is the PATH (/skills/:id), not
   a query param, so a skill is a page with its own tabs rather than a panel. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { CreateSkillModal } from "../CreateSkillModal";
import { ImportSkillDrawer, type ImportTab } from "../ImportSkillDrawer";
import { DEFAULT_TAB, SKELETON_COUNT, SKELETON_HEIGHT } from "./constants";
import { filterSkills, skillHref } from "./helpers";
import { s } from "./styles";

export function SkillsRail({
  selectedId,
  tab = DEFAULT_TAB,
}: {
  selectedId?: string | null;
  tab?: string;
}) {
  const t = useTranslations("skills");
  const router = useRouter();

  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();

  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [importTab, setImportTab] = React.useState<ImportTab | null>(null);

  const list = filterSkills(skills ?? [], query);
  const open = (id: string) => router.push(skillHref(id, tab));

  return (
    <div style={s.rail}>
      {creating && (
        <CreateSkillModal onClose={() => setCreating(false)} onCreated={(sk) => open(sk.id)} />
      )}
      {importTab && (
        <ImportSkillDrawer
          initialTab={importTab}
          onClose={() => setImportTab(null)}
          onImported={(sk) => open(sk.id)}
        />
      )}

      <div style={s.head}>
        <div style={s.titleRow}>
          <h1 style={s.h1}>{t("page.railHeading")}</h1>
          <Dropdown
            width={220}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              {
                label: t("page.menu.createFromScratch"),
                icon: "Edit",
                onClick: () => setCreating(true),
              },
              { divider: true },
              { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setImportTab("file") },
              { label: t("page.menu.fromUrl"), icon: "Link", onClick: () => setImportTab("url") },
            ]}
          />
        </div>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("page.searchPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>

      <div style={s.list}>
        {isLoading &&
          Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <Skeleton key={i} height={SKELETON_HEIGHT} />
          ))}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => setImportTab("file")}
          />
        )}
        {list.map((sk) => (
          <SkillCard
            key={sk.id}
            skill={sk}
            active={sk.id === selectedId}
            onClick={() => open(sk.id)}
            onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
          />
        ))}
      </div>
    </div>
  );
}
