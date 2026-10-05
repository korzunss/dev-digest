/* FirstTasks — the 1–2 starter tasks that survived grounding: title, Markdown
   body, file chips. Fewer than the full set ⇒ a note says how many (AC-11, 15). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { OnboardingTask } from "@devdigest/shared";
import { stripMarkdownImages } from "../../helpers";
import { SafeMarkdown } from "../SafeMarkdown";

const styles = {
  wrap: { display: "flex", flexDirection: "column", gap: 12 } satisfies React.CSSProperties,
  note: { margin: 0, fontSize: 12, color: "var(--text-secondary)" } satisfies React.CSSProperties,
  task: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 6,
  } satisfies React.CSSProperties,
  title: { margin: 0, fontSize: 14, fontWeight: 650 } satisfies React.CSSProperties,
  files: { display: "flex", flexWrap: "wrap", gap: 6 } satisfies React.CSSProperties,
} as const;

export function FirstTasks({ tasks }: { tasks: OnboardingTask[] }) {
  const t = useTranslations("onboarding");
  if (tasks.length === 0) return <p style={styles.note}>{t("tasks.generateFirst")}</p>;

  return (
    <div style={styles.wrap}>
      {tasks.length < 3 && <p style={styles.note}>{t("tasks.onlyN", { count: tasks.length })}</p>}
      {tasks.map((task, i) => (
        <article key={`${i}-${task.title}`} style={styles.task}>
          <h3 style={styles.title}>{task.title}</h3>
          <SafeMarkdown>{stripMarkdownImages(task.body)}</SafeMarkdown>
          {task.files.length > 0 && (
            <div style={styles.files}>
              {task.files.map((f) => (
                <Badge key={f} mono>
                  {f}
                </Badge>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
