/* ContextFooter — the totals line under the Project Context page: how many
   documents, their combined token count, and when the repo was last synced.
   "Last sync" is the repo's `last_polled_at` — the closest thing the product
   records to a clone refresh. */
"use client";

import React from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatSync } from "./helpers";
import { s } from "./styles";

export function ContextFooter({
  count,
  tokens,
  lastSync,
}: {
  count: number;
  tokens: number;
  lastSync: string | null | undefined;
}) {
  const t = useTranslations("context");
  const locale = useLocale();
  const when = formatSync(lastSync, locale);

  return (
    <div style={s.bar}>
      <span>{t("footer.count", { count })}</span>
      <span style={s.separator}>·</span>
      <span>{t("footer.tokens", { tokens })}</span>
      <span style={s.separator}>·</span>
      <span>{when ? t("footer.lastSync", { when }) : t("footer.neverSynced")}</span>
    </div>
  );
}
