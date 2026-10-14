/* ExpectedOutputEditor — the JSON array of expectations, with a live
   valid / parse-error indicator and a "Finding skeleton" action. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField } from "@devdigest/ui";
import { EXPECTED_ROWS } from "./constants";
import { parseExpected } from "./helpers";
import { s } from "./styles";

export function ExpectedOutputEditor({
  value,
  onChange,
  onSkeleton,
}: {
  value: string;
  onChange: (v: string) => void;
  onSkeleton: () => void;
}) {
  const t = useTranslations("eval.modal");
  const parsed = parseExpected(value);

  return (
    <FormField
      label={t("expectedLabel")}
      right={
        <Button kind="ghost" size="sm" icon="Plus" onClick={onSkeleton}>
          {t("skeleton")}
        </Button>
      }
    >
      <textarea
        aria-label={t("expectedLabel")}
        style={s.textarea}
        rows={EXPECTED_ROWS}
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div role="status" style={parsed.ok ? s.indicatorOk : s.indicatorBad}>
        {parsed.ok ? t("validJson") : t("invalidJson", { message: parsed.message })}
      </div>
    </FormField>
  );
}
