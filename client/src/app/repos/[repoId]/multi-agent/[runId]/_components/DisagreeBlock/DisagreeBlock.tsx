/* DisagreeBlock — "Where agents disagree" (spec 013, AC-35, 46, 47, 50, 51).
   One entry per listed group: `file:line · title`, then a take per agent that
   finished (severity word + its title, or the bare "did not flag"). The
   "Show only conflicts" toggle is labelled and filters in `helpers.ts`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle } from "@devdigest/ui";
import type { Conflict } from "@devdigest/shared";
import { SEVERITY_META } from "@/lib/severity";
import { visibleGroups } from "./helpers";
import { s } from "./styles";

const WORD = { CRITICAL: "critical", WARNING: "warning", SUGGESTION: "suggestion" } as const;

export function DisagreeBlock({ conflicts }: { conflicts: Conflict[] }) {
  const t = useTranslations("runs");
  const [only, setOnly] = React.useState(false);
  const groups = visibleGroups(conflicts, only);

  return (
    <section style={s.wrap} aria-label={t("conflicts.title")}>
      <div style={s.head}>
        <h2 style={s.title}>{t("conflicts.title")}</h2>
        <label style={s.toggleLabel}>
          {t("conflicts.onlyConflicts")}
          <Toggle on={only} onChange={setOnly} />
        </label>
      </div>

      {groups.length === 0 && <div style={s.empty}>{t("conflicts.empty")}</div>}

      {groups.map((g) => (
        <div key={g.id} style={s.group} data-testid="conflict-group">
          <div style={s.groupHead}>
            <span style={s.loc}>
              {g.file}:{g.line}
            </span>
            <span style={s.groupTitle}>{g.title}</span>
          </div>
          <div style={s.takes}>
            {g.takes.map((take) => {
              const v = take.verdict;
              const flagged = v !== "ignored";
              const color = v !== "ignored" ? SEVERITY_META[v].color : "var(--text-muted)";
              return (
                <div key={take.run_id} style={s.take}>
                  <span style={s.agent}>{take.agent_name ?? t("column.deletedAgent")}</span>
                  <span style={s.verdict(color)}>
                    <span style={s.dot(color)} />
                    {v !== "ignored" ? t(`severity.${WORD[v]}`) : t("conflicts.didNotFlag")}
                  </span>
                  {flagged && take.title && <span style={s.takeTitle}>{take.title}</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

export default DisagreeBlock;
