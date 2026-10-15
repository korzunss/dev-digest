/* ExportWizard — Target → Preview → Configure → Install (spec 014). The caller
   (CiTab) portals it; it owns one reducer and the data hooks, the steps render. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ExportWizardSteps, Modal } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useCiInstall, useCiInstallations, useCiPreview, useValidateCiWorkflow } from "@/lib/hooks/ci";
import { useActiveRepo } from "@/lib/repo-context";
import { ConfigureStep } from "./ConfigureStep";
import { InstallStep } from "./InstallStep";
import { PreviewStep } from "./PreviewStep";
import { TargetStep } from "./TargetStep";
import { STEP_CONFIGURE, STEP_INSTALL, STEP_KEYS, STEP_PREVIEW, STEP_TARGET, ZIP_FILENAME } from "./constants";
import {
  downloadZip,
  type CiExportRequest,
  initialState,
  installInputOf,
  isInstalledOn,
  previewInputOf,
  wizardReducer,
  workflowTextOf,
  type InstallMode,
} from "./helpers";
import { s } from "./styles";

export function ExportWizard({ agent, request, onClose }: { agent: Agent; request: CiExportRequest; onClose: () => void }) {
  const t = useTranslations("ci");
  const [state, dispatch] = React.useReducer(wizardReducer, request, initialState);
  const { repos, activeRepo } = useActiveRepo();
  const githubRepos = repos.filter((r) => r.provider === "github");
  // Derived: until the user picks one, the active GitHub repo (else the first) is the target.
  const repoId = state.repoId ?? githubRepos.find((r) => r.id === activeRepo?.id)?.id ?? githubRepos[0]?.id ?? null;
  const repo = githubRepos.find((r) => r.id === repoId);

  const preview = useCiPreview(agent.id, previewInputOf(state, repoId));
  const installations = useCiInstallations(agent.id);
  const validate = useValidateCiWorkflow(agent.id);
  const install = useCiInstall(agent.id);
  const files = preview.data?.files ?? [];
  const providerBlocked = agent.provider !== "openrouter";
  // AC-10: known from the agent's installations, so the note shows before any preview is fetched.
  const alreadyInstalled =
    isInstalledOn(request.installation, repoId) ||
    (installations.data ?? []).some((i) => i.repo_id === repoId) ||
    !!preview.data?.existing_installation_id;
  const previewReady = !!preview.data && !preview.data.blocked && !preview.isFetching;
  const installed = install.data !== undefined;

  const goPreview = () => dispatch({ type: "go", step: STEP_PREVIEW });
  const checkAndContinue = () =>
    validate.mutate(
      { workflow: workflowTextOf(state, files), triggers: state.triggers, post_as: state.postAs },
      {
        onSuccess: (check) => {
          dispatch({ type: "setCheck", check });
          if (check.errors.length === 0) dispatch({ type: "go", step: STEP_CONFIGURE });
        },
      },
    );
  const runInstall = (mode: InstallMode) => {
    if (!repoId) return;
    dispatch({ type: "setMode", mode });
    install.mutate(installInputOf(state, repoId, mode), {
      onSuccess: (result) => {
        if (result.zip_base64) downloadZip(result.zip_base64, ZIP_FILENAME);
      },
    });
  };

  const back = () => dispatch({ type: "go", step: state.step - 1 });
  const errorCode = install.error instanceof ApiError ? install.error.code : undefined;
  const errorMessage = install.error instanceof ApiError ? install.error.message : undefined;
  const errorDetails = install.error instanceof ApiError ? install.error.details : undefined;

  let primary: React.ReactNode;
  if (installed) {
    primary = <Button kind="primary" onClick={onClose}>{t("exportWizard.done")}</Button>;
  } else if (state.step === STEP_TARGET) {
    primary = (
      <Button kind="primary" iconRight="ArrowRight" disabled={!repoId || providerBlocked} onClick={goPreview}>
        {t("exportWizard.continue")}
      </Button>
    );
  } else if (state.step === STEP_PREVIEW) {
    primary = (
      <Button kind="primary" iconRight="ArrowRight" disabled={!previewReady || validate.isPending} loading={validate.isPending} onClick={checkAndContinue}>
        {validate.isPending ? t("exportWizard.validating") : t("exportWizard.continue")}
      </Button>
    );
  } else if (state.step === STEP_CONFIGURE) {
    primary = (
      <Button kind="primary" iconRight="ArrowRight" disabled={!previewReady} onClick={() => dispatch({ type: "go", step: STEP_INSTALL })}>
        {t("exportWizard.continue")}
      </Button>
    );
  } else {
    primary = (
      <Button kind="primary" icon="Check" disabled={!previewReady || install.isPending} loading={install.isPending} onClick={() => runInstall(state.mode)}>
        {install.isPending ? t("exportWizard.installing") : t("exportWizard.install")}
      </Button>
    );
  }

  return (
    <Modal
      width={860}
      title={t("exportWizard.title")}
      subtitle={t("exportWizard.subtitle", { agentName: agent.name })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {state.step > STEP_TARGET && !installed && (
            <Button kind="secondary" icon="ChevronLeft" onClick={back} disabled={install.isPending}>
              {t("exportWizard.back")}
            </Button>
          )}
          <span style={s.spacer} />
          {primary}
        </div>
      }
    >
      <div style={s.stepper}>
        <ExportWizardSteps step={state.step} labels={STEP_KEYS.map((k) => t(`exportWizard.steps.${k}`))} />
      </div>
      {state.step === STEP_TARGET && (
        <TargetStep
          repos={githubRepos}
          repoId={repoId}
          onRepo={(id) => dispatch({ type: "setRepo", repoId: id })}
          alreadyInstalled={alreadyInstalled}
          providerBlocked={providerBlocked}
          provider={agent.provider}
        />
      )}
      {state.step === STEP_PREVIEW && (
        <PreviewStep
          preview={preview.data}
          isLoading={preview.isLoading}
          isError={preview.isError}
          selectedPath={state.selectedPath}
          onSelect={(path) => dispatch({ type: "selectFile", path })}
          workflowText={workflowTextOf(state, files)}
          onEdit={(text) => dispatch({ type: "editWorkflow", text })}
          check={state.check}
          updating={request.installation !== null}
        />
      )}
      {state.step === STEP_CONFIGURE && (
        <ConfigureStep
          triggers={state.triggers}
          postAs={state.postAs}
          onTrigger={(trigger) => dispatch({ type: "toggleTrigger", trigger })}
          onPostAs={(postAs) => dispatch({ type: "setPostAs", postAs })}
          check={state.check}
        />
      )}
      {state.step === STEP_INSTALL && (
        <InstallStep
          repo={repo?.full_name ?? ""}
          fileCount={preview.data?.file_count ?? files.length}
          mode={state.mode}
          onMode={(mode) => dispatch({ type: "setMode", mode })}
          result={install.data}
          errorCode={errorCode}
          errorDetails={errorDetails}
          errorMessage={errorMessage}
          failed={install.isError}
          pending={install.isPending}
          onZipInstead={() => runInstall("zip")}
        />
      )}
    </Modal>
  );
}
