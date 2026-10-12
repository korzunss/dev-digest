/* RunAgentsList — the body of a "run many agents" confirm: how many cases
   across how many agents will run, each agent's model, and who is skipped and
   why (AC-35, AC-79). Shared by the dashboard's "Run all agents" and the skill
   editor's "Run on evals". */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalRunAllPreview } from "@devdigest/shared";
import { s } from "./styles";

export function RunAgentsList({ preview }: { preview: EvalRunAllPreview }) {
  const t = useTranslations("eval.dashboard");
  const reason = (k: EvalRunAllPreview["skipped"][number]) => t(`reason.${k.reason}`, { provider: k.provider });
  return (
    <div style={s.agentsList}>
      {preview.agents.length === 0 ? (
        <div>{t("runAllNothing")}</div>
      ) : (
        <>
          <div>{t("runAllBody", { count: preview.total_cases, agents: preview.agents.length })}</div>
          <ul style={s.agentsUl}>
            {preview.agents.map((a) => (
              <li key={a.agent_id}>{t("runAllAgentLine", { name: a.name, model: a.model, count: a.cases })}</li>
            ))}
          </ul>
        </>
      )}
      {preview.skipped.length > 0 && (
        <div>
          <div style={s.skipped}>{t("skippedHeading")}</div>
          <ul style={s.agentsUl}>
            {preview.skipped.map((k) => (
              <li key={k.agent_id} style={s.skipped}>
                {t("skipped", { name: k.name, reason: reason(k) })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
