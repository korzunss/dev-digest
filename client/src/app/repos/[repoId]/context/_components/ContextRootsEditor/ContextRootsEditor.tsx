/* ContextRootsEditor — the repo's search roots: globs, one per line, deciding
   which Markdown files count as context documents. Save replaces them, Reset
   restores the default. The server is the validator (a glob it refuses comes
   back as a 422 naming it), so this only shows what it says.

   The draft is local state seeded from the saved roots; the page re-keys this
   component on the saved value, so a save or reset re-seeds it without an effect. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { ContextRoots } from "@devdigest/shared";
import { ROOTS_ROWS } from "../../constants";
import { formatGlobs, parseGlobs } from "./helpers";
import { s } from "./styles";

export function ContextRootsEditor({
  roots,
  saving,
  error,
  onSave,
  onReset,
}: {
  roots: ContextRoots;
  saving?: boolean;
  /** The server's message for a refused save, or null. */
  error: string | null;
  onSave: (globs: string[]) => void;
  onReset: () => void;
}) {
  const t = useTranslations("context");
  const [draft, setDraft] = React.useState(() => formatGlobs(roots.globs));

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <span style={s.title}>{t("roots.title")}</span>
        {roots.is_default && <Badge color="var(--text-secondary)">{t("roots.default")}</Badge>}
      </div>
      <div style={s.hint}>{t("roots.hint")}</div>
      <textarea
        className="mono"
        style={s.textarea}
        rows={ROOTS_ROWS}
        value={draft}
        aria-label={t("roots.label")}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
      />
      {error && (
        <div role="alert" style={s.error}>
          {error}
        </div>
      )}
      <div style={s.actions}>
        <Button kind="primary" loading={saving} onClick={() => onSave(parseGlobs(draft))}>
          {t("roots.save")}
        </Button>
        <Button kind="secondary" disabled={saving || roots.is_default} onClick={onReset}>
          {t("roots.reset")}
        </Button>
      </div>
    </div>
  );
}
