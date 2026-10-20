/* FailedRunsNote — "+N failed runs not counted" (AC-8a, M-15). Hidden at 0. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { s } from "./styles";

export function FailedRunsNote({ count }: { count: number }) {
  const t = useTranslations("agentPerformance");
  if (!(count > 0)) return null;
  return <span style={s.muted}>{t("accept.failedNotCounted", { n: count })}</span>;
}

export default FailedRunsNote;
