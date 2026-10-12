/* RunConfirmModal — a run calls the model and costs money, so it names the
   model and asks first. (ConfirmModal is the red destructive variant.) */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { s } from "./styles";

export function RunConfirmModal({ model, onConfirm, onClose }: { model: string; onConfirm: () => void; onClose: () => void }) {
  const t = useTranslations("eval.modal");
  const common = useTranslations("common");
  return (
    <Modal
      width={440}
      title={t("runConfirmTitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {common("actions.cancel")}
          </Button>
          <Button kind="primary" icon="Play" onClick={onConfirm}>
            {t("runConfirm")}
          </Button>
        </div>
      }
    >
      <div style={s.saved}>{t("runConfirmBody", { model })}</div>
    </Modal>
  );
}
