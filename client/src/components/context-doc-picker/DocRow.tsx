/* DocRow — one line of the context-doc picker: handle, checkbox, path, type,
   tokens, preview. Presentational: every decision is the picker's, passed in. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, Icon, IconBtn } from "@devdigest/ui";
import { DEFAULT_DOC_TYPE } from "./constants";
import type { PickerRow } from "./helpers";
import { s } from "./styles";

export interface DocRowHandlers {
  onToggle: (path: string) => void;
  onPreview: (path: string) => void;
  /** Arrow-key move of an attached row by `delta` positions. */
  onMove: (path: string, delta: number) => void;
  onDragStart: (path: string) => void;
  onDragEnd: () => void;
  onDrop: (path: string) => void;
}

export function DocRow({
  row,
  dragging,
  anyDragging,
  handlers,
}: {
  row: PickerRow;
  dragging: boolean;
  anyDragging: boolean;
  handlers: DocRowHandlers;
}) {
  const t = useTranslations("context");
  const { path, kind, doc } = row;
  const attached = kind === "attached";
  const type = doc?.type ?? DEFAULT_DOC_TYPE;

  return (
    <div
      draggable={attached}
      onDragStart={() => handlers.onDragStart(path)}
      onDragEnd={handlers.onDragEnd}
      onDragOver={(e) => {
        if (attached && anyDragging) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        handlers.onDrop(path);
      }}
      style={s.row(attached || kind === "inherited", dragging)}
    >
      {kind === "inherited" ? (
        <span style={s.handleSpace} />
      ) : (
        // A drag handle alone is unreachable without a pointer, so the same
        // control moves the row with the arrow keys.
        <button
          type="button"
          disabled={!attached}
          aria-label={t("picker.reorder", { path })}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              handlers.onMove(path, e.key === "ArrowUp" ? -1 : 1);
            }
          }}
          style={s.handle(attached)}
        >
          <Icon.ChevronsUpDown size={14} />
        </button>
      )}

      {kind === "inherited" ? (
        // Inherited rows are owned by a skill: shown ticked, never togglable here.
        <input
          type="checkbox"
          checked
          disabled
          readOnly
          aria-label={path}
          title={t("picker.viaTitle", { skill: row.skillName ?? "" })}
        />
      ) : (
        <Checkbox
          checked={attached}
          onChange={() => handlers.onToggle(path)}
          label={
            <span className="mono" style={s.path}>
              {path}
            </span>
          }
        />
      )}
      {kind === "inherited" && (
        <span className="mono" style={s.path}>
          {path}
        </span>
      )}

      {kind === "inherited" && (
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("picker.via", { skill: row.skillName ?? "" })}
        </Badge>
      )}
      {doc === undefined && <Badge color="var(--warning, var(--text-secondary))">{t("picker.notInRepo")}</Badge>}
      {doc !== undefined && <Badge color="var(--text-secondary)">{t(`picker.types.${type}`)}</Badge>}
      {doc?.tokens != null && (
        <span style={s.tokenCount}>{t("picker.tokensValue", { tokens: doc.tokens })}</span>
      )}
      <IconBtn
        icon="Eye"
        size={26}
        label={t("picker.preview", { path })}
        onClick={() => handlers.onPreview(path)}
      />
    </div>
  );
}
