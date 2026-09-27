/* DiffOrderToggle — the Smart order | Original order switch (spec 007, D7).
   A two-item radiogroup, not a checkbox: the two orders are mutually
   exclusive alternate views of the same file list, never a single boolean. */
"use client";

import { useTranslations } from "next-intl";
import { s } from "./styles";

export type DiffOrder = "smart" | "original";

export function DiffOrderToggle({
  value,
  onChange,
}: {
  value: DiffOrder;
  onChange: (value: DiffOrder) => void;
}) {
  const t = useTranslations("prReview");

  const items: { value: DiffOrder; labelKey: "smartOrder" | "originalOrder" }[] = [
    { value: "smart", labelKey: "smartOrder" },
    { value: "original", labelKey: "originalOrder" },
  ];

  return (
    <div role="radiogroup" aria-label={t("smartDiff.orderLabel")} style={s.group}>
      {items.map((item) => {
        const checked = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(item.value)}
            style={checked ? s.itemActive : s.item}
          >
            {t(`smartDiff.${item.labelKey}`)}
          </button>
        );
      })}
    </div>
  );
}
