/* SkillsDiff — how the two runs' recorded skill sets differ: added, removed,
   changed in version; "same skills" when equal (AC-76). */
import React from "react";
import { useTranslations } from "next-intl";
import type { EvalCompare } from "@devdigest/shared";
import { s } from "./styles";

export function SkillsDiff({ diff, same }: { diff: EvalCompare["skills_diff"]; same: boolean }) {
  const t = useTranslations("eval.compare");
  if (same) return <div style={s.note}>{t("sameSkills")}</div>;
  return (
    <ul style={s.list}>
      {diff.added.length > 0 && <li>{t("skillsAdded", { names: diff.added.map((k) => k.name).join(", ") })}</li>}
      {diff.removed.length > 0 && <li>{t("skillsRemoved", { names: diff.removed.map((k) => k.name).join(", ") })}</li>}
      {diff.changed.map((c) => (
        <li key={c.name}>{t("skillsChanged", { name: c.name, from: c.from, to: c.to })}</li>
      ))}
    </ul>
  );
}
