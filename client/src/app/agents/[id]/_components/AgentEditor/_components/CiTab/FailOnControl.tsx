/* FailOnControl — edits the agent's `ci_fail_on` (AC-35). Saving goes through the
   normal agent update, so it creates a new agent version like any config change. */
"use client";

import { useTranslations } from "next-intl";
import { FormField, SelectInput } from "@devdigest/ui";
import type { Agent, CiFailOn } from "@devdigest/shared";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { CI_FAIL_ON_VALUES } from "./helpers";
import { s } from "./styles";

export function FailOnControl({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const ta = useTranslations("agents");
  const update = useUpdateAgent();
  const options = CI_FAIL_ON_VALUES.map((v) => ({ value: v, label: ta(`config.ciFailOnOptions.${v}`) }));
  return (
    <div style={s.failOn}>
      <FormField label={t("ciTab.failOn.label")} hint={update.isPending ? t("ciTab.failOn.saving") : t("ciTab.failOn.hint")}>
        <SelectInput
          value={agent.ci_fail_on}
          onChange={(v) => {
            // A failure is surfaced by the global mutation error toast.
            if (v !== agent.ci_fail_on && !update.isPending) update.mutate({ id: agent.id, patch: { ci_fail_on: v as CiFailOn } });
          }}
          options={options}
        />
      </FormField>
    </div>
  );
}
