/* RunConfirm — a run calls the model and costs money, so it names what will
   run and on which model, and asks first (AC-28, AC-33). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { s } from "./styles";

export function RunConfirm({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const common = useTranslations("common");
  return (
    <Modal
      width={440}
      title={title}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {common("actions.cancel")}
          </Button>
          <Button kind="primary" icon="Play" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div style={s.confirmBody}>{body}</div>
    </Modal>
  );
}
