/* RemoveConfirm — says what removing does: only the DevDigest record goes, past
   runs stay, and the files already in the repo must be removed by hand (AC-60). */
"use client";

import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { s } from "./styles";

export function RemoveConfirm({
  repo,
  pending,
  onConfirm,
  onClose,
}: {
  repo: string;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("ci");
  return (
    <Modal
      width={520}
      title={t("ciTab.remove.title", { repo })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose} disabled={pending}>
            {t("ciTab.cancel")}
          </Button>
          <Button kind="danger" icon="Trash" onClick={onConfirm} loading={pending} disabled={pending}>
            {pending ? t("ciTab.remove.removing") : t("ciTab.remove.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>{t("ciTab.remove.body")}</div>
    </Modal>
  );
}
