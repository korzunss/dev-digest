/* PeriodControl — the period menu shared by the dashboard and the Stats tab (AC-1…AC-4).
   "1 day" / "30 days" apply at once; "Custom" opens two native date inputs and an Apply
   button. An invalid range shows its message and leaves the selection unchanged. */
"use client";

import React, { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { localToday, validateCustom, type PeriodKind, type PeriodSel } from "@/lib/period";
import { s } from "./styles";

const KINDS: PeriodKind[] = ["1d", "30d", "custom"];

export function PeriodControl({
  value,
  onChange,
  today,
}: {
  value: PeriodSel;
  onChange: (next: PeriodSel) => void;
  /** Browser-local `YYYY-MM-DD`; injectable for tests. */
  today?: string;
}) {
  const t = useTranslations("agentPerformance");
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(value.period === "custom");
  const [from, setFrom] = useState(value.from ?? "");
  const [to, setTo] = useState(value.to ?? "");
  const [error, setError] = useState<"future" | "order" | "tooLong" | null>(null);
  const errorId = useId();
  const limit = today ?? localToday();

  const label = value.period === "custom" ? `${value.from} – ${value.to}` : t(`period.${value.period}`);

  function pick(kind: PeriodKind) {
    if (kind === "custom") {
      setCustomOpen(true);
      return;
    }
    setError(null);
    setOpen(false);
    onChange({ period: kind });
  }

  function apply() {
    const problem = validateCustom(from, to, limit);
    setError(problem);
    if (problem) return;
    setOpen(false);
    onChange({ period: "custom", from, to });
  }

  return (
    <div
      style={s.root}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        style={s.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t("period.label")}: ${label}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon.Calendar size={14} />
        <span>{label}</span>
      </button>
      {open && (
        <div style={s.menu}>
          <div role="menu" aria-label={t("period.label")}>
            {KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                role="menuitemradio"
                aria-checked={kind === value.period}
                style={s.item}
                onClick={() => pick(kind)}
              >
                <span>{t(`period.${kind}`)}</span>
                {kind === value.period && <Icon.Check size={14} />}
              </button>
            ))}
          </div>
          {customOpen && (
            <div style={s.custom}>
              <label style={s.field}>
                {t("period.from")}
                <input
                  type="date"
                  style={s.input}
                  value={from}
                  max={limit}
                  aria-invalid={error != null}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label style={s.field}>
                {t("period.to")}
                <input
                  type="date"
                  style={s.input}
                  value={to}
                  max={limit}
                  aria-invalid={error != null}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              {error && (
                <div id={errorId} role="alert" style={s.error}>
                  {t(`period.errors.${error}`)}
                </div>
              )}
              <button type="button" style={s.item} onClick={apply}>
                {t("period.apply")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default PeriodControl;
