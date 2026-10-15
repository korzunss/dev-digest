/* UpdatePicker — "Update CI config" with several installations asks which one (AC-33). */
"use client";

import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { CiInstallationView } from "@devdigest/shared";
import { s } from "./styles";

export function UpdatePicker({
  installations,
  onPick,
  onClose,
}: {
  installations: readonly CiInstallationView[];
  onPick: (installation: CiInstallationView) => void;
  onClose: () => void;
}) {
  const t = useTranslations("ci");
  return (
    <Modal width={460} title={t("ciTab.update.title")} onClose={onClose}>
      <div style={s.body}>
        <div>{t("ciTab.update.body")}</div>
        <div style={s.pick}>
          {installations.map((i) => (
            <Button key={i.id} kind="secondary" icon="GitBranch" full onClick={() => onPick(i)}>
              <span className="mono">{i.repo}</span>
            </Button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
