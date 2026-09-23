/* SkillEditor — the right pane of /skills/:id. Six tabs over one skill; the
   selected tab lives in ?tab= so a tab is linkable and survives a reload. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab";
import { ContextTab } from "./_components/ContextTab";
import { PreviewTab } from "./_components/PreviewTab";
import { EvalsTab } from "./_components/EvalsTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { DEFAULT_TAB, TABS } from "./constants";
import { s } from "./styles";

/** One component per tab key. Config doubles as the fallback, so an unknown
    `?tab=` that slipped past the route's whitelist still renders something. */
const PANES: Record<string, React.ComponentType<{ skill: Skill }>> = {
  config: ConfigTab,
  context: ContextTab,
  preview: PreviewTab,
  evals: EvalsTab,
  stats: StatsTab,
  versions: VersionsTab,
};

export function SkillEditor({
  skill,
  tab,
  onTab,
}: {
  skill: Skill;
  tab: string;
  onTab: (t: string) => void;
}) {
  const t = useTranslations("skills");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  const Pane = PANES[tab] ?? PANES[DEFAULT_TAB]!;

  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {/* Keyed on the skill so switching skills remounts the tab: every tab
            holds draft state, and a draft must not follow you to another
            skill. */}
        <Pane key={skill.id} skill={skill} />
      </div>
    </div>
  );
}
