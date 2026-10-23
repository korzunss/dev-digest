/* PromptGroups — the review calls of a run: for each, its files and the skills
   injected into it. Paths and names are rendered as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { RunTraceWithGroups } from "@devdigest/shared/contracts/skill-scope.js";
import { LEGACY_GROUP_LABEL, promptGroupsOf } from "../../helpers";
import { s } from "../../styles";

export function PromptGroups({ trace }: { trace: RunTraceWithGroups }) {
  const t = useTranslations("runs");
  const groups = promptGroupsOf(trace);
  return (
    <div>
      {groups.map((g, i) => (
        <div key={`${g.label}-${i}`} style={s.groupRow} data-testid="prompt-group">
          <div style={s.groupHead}>
            <span className="mono">{g.label === LEGACY_GROUP_LABEL ? t("trace.groups.allFiles") : g.label}</span>
            {g.skipped && <Badge color="var(--warn)">{t("trace.groups.skipped")}</Badge>}
          </div>
          <div style={s.groupLine}>
            <span>{t("trace.groups.files")}:</span>
            {g.files.length === 0 ? (
              <span className="mono">{t("trace.groups.allFiles")}</span>
            ) : (
              g.files.map((f) => (
                <span key={f} className="mono">
                  {f}
                </span>
              ))
            )}
          </div>
          <div style={s.groupLine}>
            <span>{t("trace.groups.skills")}:</span>
            {g.skills.length === 0 ? (
              <span>{t("trace.groups.noSkills")}</span>
            ) : (
              g.skills.map((sk) => (
                <span key={sk.name} className="mono">
                  {sk.version != null ? `${sk.name} v${sk.version}` : sk.name}
                </span>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
