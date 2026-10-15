/* CiRunsFilters — time range, agent, repo and status. Controlled: the values
   come from the URL and every change goes back through `onChange`. */
"use client";

import { useTranslations } from "next-intl";
import { SelectInput } from "@devdigest/ui";
import { RANGES, RANGE_LABEL_KEY, STATUSES, type Filters } from "./helpers";
import { s } from "./styles";

interface Option {
  value: string;
  label: string;
}

export function CiRunsFilters({
  filters,
  agents,
  repos,
  onChange,
}: {
  filters: Filters;
  agents: readonly { id: string; name: string }[];
  repos: readonly string[];
  onChange: (patch: Partial<Record<keyof Filters, string>>) => void;
}) {
  const t = useTranslations("ci.runs");
  const range: Option[] = RANGES.map((r) => ({ value: r, label: t(`filters.${RANGE_LABEL_KEY[r]}`) }));
  const agent: Option[] = [{ value: "", label: t("filters.allAgents") }, ...agents.map((a) => ({ value: a.id, label: a.name }))];
  const repo: Option[] = [{ value: "", label: t("filters.allRepos") }, ...repos.map((r) => ({ value: r, label: r }))];
  const status: Option[] = [
    { value: "", label: t("filters.allStatuses") },
    ...STATUSES.map((x) => ({ value: x, label: t(`status.${x}`) })),
  ];

  return (
    <div style={s.filters}>
      <SelectInput value={filters.range} onChange={(v) => onChange({ range: v })} options={range} mono={false} />
      <SelectInput value={filters.agent} onChange={(v) => onChange({ agent: v })} options={agent} mono={false} />
      <SelectInput value={filters.repo} onChange={(v) => onChange({ repo: v })} options={repo} mono={false} />
      <SelectInput value={filters.status} onChange={(v) => onChange({ status: v })} options={status} mono={false} />
    </div>
  );
}
