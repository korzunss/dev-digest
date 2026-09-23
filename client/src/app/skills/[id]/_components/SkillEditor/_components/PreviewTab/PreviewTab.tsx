/* PreviewTab — the skill body as prose. The Config tab shows the source; this
   shows what it becomes, which is how the reviewing agent receives it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("tabs.preview")}</h2>
        <p style={s.subtitle}>{t("preview.subtitle")}</p>
      </div>
      <div style={s.sheet}>
        {skill.body.trim() === "" ? (
          <div style={s.empty}>{t("preview.emptyBody")}</div>
        ) : (
          <Markdown>{skill.body}</Markdown>
        )}
      </div>
    </div>
  );
}
