/* /skills — the Skills Lab index. A full-width card grid, laid out like the
   Agents list: the two screens are siblings in the sidebar and describe the same
   kind of object, so they read as one product rather than two.

   The rail this replaced is NOT gone — `/skills/:id` still renders `SkillsRail`
   as its left column, because once you are editing a skill, switching to another
   one without going back is the whole point of a rail. It just isn't what an
   index page should be: a 300px column beside an empty pane spent most of the
   viewport telling you to pick something. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { ConfirmModal } from "@/components/confirm-modal";
import { useDeleteSkill, useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { CreateSkillModal } from "../CreateSkillModal";
import { ImportSkillDrawer, type ImportTab } from "../ImportSkillDrawer";
// The rail owns these: it is where a skill's href and the list filter were
// defined, and both are already part of its barrel. Re-deriving them here would
// be a second source of truth for "which tab does a card open".
import { DEFAULT_TAB, filterSkills, skillHref } from "../SkillsRail";
import { SKELETON_COUNT, SKELETON_HEIGHT } from "./constants";
import { s } from "./styles";

export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();

  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const remove = useDeleteSkill();

  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [importTab, setImportTab] = React.useState<ImportTab | null>(null);
  // The skill awaiting confirmation. One piece of state rather than a boolean
  // plus an id, so there is no state where the modal is open and asking about
  // nothing — and the name in the question always matches the row you pressed.
  const [pendingDelete, setPendingDelete] = React.useState<Skill | null>(null);

  const list = filterSkills(skills ?? [], query);
  const open = (id: string) => router.push(skillHref(id, DEFAULT_TAB));

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
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
      {pendingDelete && (
        <ConfirmModal
          title={t("page.deleteTitle")}
          body={t("page.deleteConfirm", { name: pendingDelete.name })}
          confirmLabel={t("page.delete")}
          pending={remove.isPending}
          onClose={() => setPendingDelete(null)}
          // Closing only on success keeps the question on screen when the
          // delete fails; the global MutationCache.onError has already said why.
          onConfirm={() =>
            remove.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) })
          }
        />
      )}

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.heading")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
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

        {isLoading && (
          <div style={s.grid}>
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <Skeleton key={i} height={SKELETON_HEIGHT} />
            ))}
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {/* An empty library and a search that matched nothing are different
            statements, and only the first should invite you to import: telling
            someone with 12 skills that they have none is both wrong and the
            wrong next action. */}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={query.trim() === "" ? t("page.empty.title") : t("page.noMatches.title")}
            body={query.trim() === "" ? t("page.empty.body") : t("page.noMatches.body")}
            {...(query.trim() === ""
              ? { cta: t("page.empty.cta"), onCta: () => setImportTab("file") }
              : {})}
          />
        )}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                onClick={() => open(sk.id)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                onDelete={() => setPendingDelete(sk)}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
