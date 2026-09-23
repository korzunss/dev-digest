/* ConfirmModal — the one place a destructive action asks before it happens.

   It replaces `window.confirm`, which looked like a confirmation and was not one
   in the ways that matter here: it cannot be styled or themed, it has no close
   affordance beyond OK/Cancel, its copy cannot come from next-intl (so the agent
   card shipped a hardcoded English string past the whole i18n layer), and it
   blocks the main thread, so a pending delete could not show that it is running.

   Shared chrome rather than colocated: skills and agents both delete, and the
   question they ask is the same question. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function ConfirmModal({
  title,
  body,
  confirmLabel,
  pending,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  /** The verb, not OK — a button that says Delete is harder to press by reflex. */
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("common");

  return (
    <Modal
      width={MODAL_WIDTH}
      title={title}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose} disabled={pending}>
            {t("actions.cancel")}
          </Button>
          <Button kind="danger" icon="Trash" onClick={onConfirm} loading={pending} disabled={pending}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div style={s.body}>{body}</div>
    </Modal>
  );
}
