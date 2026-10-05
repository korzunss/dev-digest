/* RunCommands — numbered run commands with a copy button each. Copies exactly
   `command`; the server already allowlisted what can appear here (AC-16). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { OnboardingCommand } from "@devdigest/shared";
import { useToast } from "@/lib/toast";
import { s } from "./styles";

export function RunCommands({ commands }: { commands: OnboardingCommand[] }) {
  const t = useTranslations("onboarding");
  const toast = useToast();

  if (commands.length === 0) return <p style={s.none}>{t("commands.none")}</p>;

  const copy = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      toast.success(t("actions.copied"));
    } catch {
      toast.error(t("actions.copyFailed"));
    }
  };

  return (
    <ol style={s.list}>
      {commands.map((c, i) => (
        <li key={`${i}-${c.command}`} style={s.row}>
          <span style={s.index}>{i + 1}.</span>
          <div style={s.main}>
            <code className="mono" style={s.command}>
              {c.command}
            </code>
            {c.note && <span style={s.note}>{c.note}</span>}
          </div>
          <button
            type="button"
            style={s.copy}
            aria-label={`${t("actions.copy")} ${c.command}`}
            onClick={() => copy(c.command)}
          >
            <Icon.Copy size={14} />
          </button>
        </li>
      ))}
    </ol>
  );
}
