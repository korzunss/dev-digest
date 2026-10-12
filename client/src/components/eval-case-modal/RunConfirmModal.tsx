/* RunConfirmModal — a run calls the model and costs money, so it names the
   model and asks first. (ConfirmModal is the red destructive variant.) A skill
   case has no model of its own: `skill` swaps the model line for a picker and
   keeps Run disabled until a model is chosen (AC-87). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { EvalModelPick } from "@devdigest/shared";
import { ModelPicker } from "@/components/model-picker";
import { s } from "./styles";

export interface SkillPickProps {
  pick: EvalModelPick | null;
  onPick: (pick: EvalModelPick | null) => void;
  /** The skill is switched off: say so, its own suite still runs (AC-93). */
  disabled?: boolean;
}

export function RunConfirmModal({
  model,
  skill,
  onConfirm,
  onClose,
}: {
  model: string;
  skill?: SkillPickProps;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("eval.modal");
  const common = useTranslations("common");
  const skillTab = useTranslations("eval.skillTab");
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
          <Button kind="primary" icon="Play" disabled={!!skill && skill.pick === null} onClick={onConfirm}>
            {t("runConfirm")}
          </Button>
        </div>
      }
    >
      <div style={s.saved}>{skill ? t("runConfirmBodySkill") : t("runConfirmBody", { model })}</div>
      {skill?.disabled && <div style={s.saved}>{skillTab("disabledNote")}</div>}
      {skill && (
        <div style={s.pickerSlot}>
          <ModelPicker value={skill.pick} onChange={skill.onPick} />
        </div>
      )}
    </Modal>
  );
}
