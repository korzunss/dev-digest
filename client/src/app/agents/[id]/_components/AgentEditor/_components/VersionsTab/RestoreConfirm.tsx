/* RestoreConfirm — says what a restore will do before it does it: the skills
   that will be attached (deleted ones are dropped) and any reason the restored
   config will not run. A restore APPENDS a version; nothing is rewound. All
   names render as text nodes. */
"use client";

import { useTranslations } from "next-intl";
import { Button, Modal, Skeleton } from "@devdigest/ui";
import type { AgentVersion } from "@devdigest/shared";
import { useAgentVersionDiff, useProviderModels } from "@/lib/hooks/agents";
import { useSecretsStatus } from "@/lib/hooks/core";
import { RESTORE_WIDTH } from "./constants";
import { SkillRefLabel } from "./SkillRefLabel";
import { s } from "./styles";

export function RestoreConfirm({
  agentId,
  version,
  pending,
  onConfirm,
  onClose,
}: {
  agentId: string;
  version: AgentVersion;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("agents");
  const tc = useTranslations("common");
  const config = version.config;
  const diff = useAgentVersionDiff(agentId, version.version);
  const secrets = useSecretsStatus();
  const hasKey = config ? secrets.data?.[config.provider] === true : false;
  // Models are only worth asking for when the key exists to list them with.
  const models = useProviderModels(hasKey ? config?.provider : null);

  const skills = diff.data?.skills.from ?? [];
  const kept = skills.filter((sk) => !sk.deleted);
  const missing = skills.filter((sk) => sk.deleted);
  const noKey = !!config && secrets.data !== undefined && !hasKey;
  const unknownModel = !!config && hasKey && !!models.data && !models.data.some((m) => m.id === config.model);

  return (
    <Modal
      width={RESTORE_WIDTH}
      title={t("versions.restoreTitle", { version: version.version })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose} disabled={pending}>
            {tc("actions.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="History"
            onClick={onConfirm}
            loading={pending}
            disabled={pending || config === null || !diff.data}
          >
            {t("versions.restoreConfirm")}
          </Button>
        </div>
      }
    >
      <div style={s.restoreBody}>
        <div>{t("versions.restoreBody", { version: version.version })}</div>
        {config === null ? (
          <div style={s.warning}>{t("versions.configUnavailable")}</div>
        ) : (
          <>
            <div>
              <div style={s.heading}>{t("versions.restoreSkills")}</div>
              {diff.isLoading ? (
                <Skeleton height={40} />
              ) : !diff.data ? (
                // Never claim "no skills" when we simply could not find out.
                <div style={s.warning}>
                  <div>{t("versions.restoreDiffError")}</div>
                  <Button kind="ghost" size="sm" onClick={() => diff.refetch()}>
                    {tc("actions.retry")}
                  </Button>
                </div>
              ) : kept.length === 0 ? (
                <div style={s.muted}>{t("versions.restoreNoSkills")}</div>
              ) : (
                <ol style={s.skillList}>
                  {kept.map((sk) => (
                    <li key={sk.id}>
                      <SkillRefLabel skill={sk} />
                    </li>
                  ))}
                </ol>
              )}
            </div>
            {missing.length > 0 && (
              <div style={s.warning}>
                <div>{t("versions.restoreMissing")}</div>
                <ul>
                  {missing.map((sk) => (
                    <li key={sk.id}>
                      <SkillRefLabel skill={sk} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {noKey && <div style={s.warning}>{t("versions.restoreNoKey", { provider: config.provider })}</div>}
            {unknownModel && <div style={s.warning}>{t("versions.restoreUnknownModel", { model: config.model })}</div>}
          </>
        )}
      </div>
    </Modal>
  );
}
