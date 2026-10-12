"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { AgentVersionSkillRef } from "@devdigest/shared";
import { shortId } from "./helpers";

/** A skill by name, or by short id when the name was never recorded. Text nodes only. */
export function SkillRefLabel({ skill }: { skill: AgentVersionSkillRef }) {
  const t = useTranslations("agents");
  return (
    <>
      <span>{skill.name ?? t("versions.deletedSkill", { id: shortId(skill.id) })}</span>
      {skill.deleted && skill.name !== null && (
        <Badge color="var(--text-muted)">{t("versions.deleted")}</Badge>
      )}
    </>
  );
}
