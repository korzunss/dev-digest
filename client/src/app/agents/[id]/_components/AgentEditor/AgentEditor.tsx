/* AgentEditor — the agent's Config, Skills, Context, Evals, Versions and CI tabs. Stats arrives with
   a later lesson. Tab state lives in ?tab= so a tab is linkable. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { CiTab } from "./_components/CiTab";
import { ConfigTab } from "./_components/ConfigTab";
import { ContextTab } from "./_components/ContextTab";
import { EvalsTab } from "./_components/EvalsTab";
import { SkillsTab } from "./_components/SkillsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function AgentEditor({
  agent,
  tab,
  onTab,
  onSkillsDirtyChange,
}: {
  agent: Agent;
  tab: string;
  onTab: (t: string) => void;
  /** Reports whether the Skills tab holds staged, unsaved edits. Pass a stable setter. */
  onSkillsDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useTranslations("agents");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "skills" ? (
          <SkillsTab key={agent.id} agent={agent} onDirtyChange={onSkillsDirtyChange} />
        ) : tab === "context" ? (
          <ContextTab agent={agent} />
        ) : tab === "evals" ? (
          <EvalsTab agent={agent} />
        ) : tab === "versions" ? (
          <VersionsTab agent={agent} />
        ) : tab === "ci" ? (
          <CiTab agent={agent} />
        ) : (
          <ConfigTab key={`${agent.id}:${agent.version}`} agent={agent} />
        )}
      </div>
    </div>
  );
}
