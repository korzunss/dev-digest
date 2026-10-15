/* AlsoFlaggedBy — "also flagged by <agent>" marker of a finding whose location
   other agents flagged too (spec 013, AC-44). Names come from the run's own
   columns; a deleted agent reads "Deleted agent". Plain text only. */
import React from "react";
import { useTranslations } from "next-intl";
import type { AgentColumn } from "@devdigest/shared";
import { s } from "./styles";

export function AlsoFlaggedBy({
  runIds,
  columns,
}: {
  /** Run ids of the OTHER agents (`also_flagged_by`). */
  runIds: string[];
  columns: AgentColumn[];
}) {
  const t = useTranslations("runs");
  if (runIds.length === 0) return null;
  const names = runIds.map((id) => {
    const col = columns.find((c) => c.run_id === id);
    return col?.agent_name ?? t("column.deletedAgent");
  });
  return <div style={s.note}>{t("alsoFlaggedBy", { agents: names.join(", ") })}</div>;
}

export default AlsoFlaggedBy;
