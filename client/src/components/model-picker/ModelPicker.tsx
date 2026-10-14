"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, SearchableSelect } from "@devdigest/ui";
import type { EvalModelPick, Provider } from "@devdigest/shared";
import { useProviderModels } from "../../lib/hooks/agents";
import { toModelOptions } from "../../lib/model-label";
import { NO_PROVIDER, PROVIDER_OPTIONS } from "./constants";
import { s } from "./styles";

/** Provider + model pair for a paid eval run. Controlled: `value` is a complete
    pick or null; a provider change (or no model yet) reports null, so the
    caller can keep its confirm disabled until both are chosen. */
export function ModelPicker({
  value,
  onChange,
}: {
  value: EvalModelPick | null;
  onChange: (pick: EvalModelPick | null) => void;
}) {
  const t = useTranslations("eval.modelPicker");
  // A provider can be chosen before a model, which `value` cannot express.
  const [provider, setProvider] = React.useState<Provider | null>(value?.provider ?? null);
  const { data: models } = useProviderModels(provider);

  // Follow an external pick (the default arriving after the picker mounted).
  React.useEffect(() => {
    if (value) setProvider(value.provider);
  }, [value]);

  const providerOptions = [
    { value: NO_PROVIDER, label: t("providerPlaceholder") },
    ...PROVIDER_OPTIONS.map((p) => ({ value: p, label: p })),
  ];
  const modelOptions = toModelOptions(models);
  // The list is empty after load when the provider's key is missing or invalid.
  const noModels = provider !== null && models !== undefined && models.length === 0;
  const model = value?.provider === provider ? (value?.model ?? "") : "";

  const changeProvider = (v: string) => {
    setProvider(v === NO_PROVIDER ? null : (v as Provider));
    onChange(null);
  };

  return (
    <div style={s.root}>
      <FormField label={t("providerLabel")}>
        <SelectInput value={provider ?? NO_PROVIDER} onChange={changeProvider} options={providerOptions} />
      </FormField>
      <FormField
        label={t("modelLabel")}
        hint={noModels && provider ? t("modelEmptyHint", { provider }) : t("modelHint")}
      >
        <SearchableSelect
          value={model}
          onChange={(m) => provider && onChange({ provider, model: m })}
          options={modelOptions}
          placeholder={t("modelSearch")}
        />
      </FormField>
    </div>
  );
}
