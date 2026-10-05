/* DocPreview — the rendered Markdown of one project-context document.

   Shared by the Project Context page and both editors' pickers: all three show
   the same thing for the same path, so the loading / failed / refused states
   live here once. The content is rendered by the design system's `Markdown`
   as-is — raw HTML in a document is never interpreted and link / image URLs go
   through react-markdown's default sanitising, which is the whole XSS defence
   (a document is repository content, not trusted input). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Markdown, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useContextDoc } from "@/lib/hooks/context";
import { s } from "./styles";

export function DocPreview({ repoId, path }: { repoId: string; path: string }) {
  const t = useTranslations("context");
  const { data, isLoading, isError, error, refetch } = useContextDoc(repoId, path);

  if (isLoading) return <Skeleton height={140} />;
  if (isError) {
    // 422 = refused by the server's path guard or over the size cap. Retrying
    // cannot change that, so it gets a plain note instead of a Retry button.
    if (error instanceof ApiError && error.status === 422) {
      return (
        <div role="alert" style={s.note}>
          {t("preview.refused")}
        </div>
      );
    }
    return <ErrorState body={t("preview.loadError")} onRetry={() => refetch()} />;
  }
  if (!data?.content) return <div style={s.note}>{t("preview.empty")}</div>;

  return (
    <div style={s.wrap}>
      <Markdown>{data.content}</Markdown>
    </div>
  );
}

export default DocPreview;
