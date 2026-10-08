/* OnThisPage — the sticky section index beside the tour (AC-28). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useActiveSection } from "./useActiveSection";
import { s } from "./styles";

export interface OnThisPageItem {
  id: string;
  label: string;
}

export function OnThisPage({ items }: { items: readonly OnThisPageItem[] }) {
  const t = useTranslations("onboarding");
  const active = useActiveSection(items.map((i) => i.id));

  const jump = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    // jsdom has no scrollIntoView; the optional call keeps tests honest.
    document.getElementById(id)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  return (
    <nav aria-label={t("onThisPage")} style={s.nav}>
      <div style={s.heading}>{t("onThisPage")}</div>
      <ul style={s.list}>
        {items.map((item) => {
          const current = item.id === active;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={current ? "true" : undefined}
                style={current ? s.linkActive : s.link}
                onClick={(e) => jump(e, item.id)}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
