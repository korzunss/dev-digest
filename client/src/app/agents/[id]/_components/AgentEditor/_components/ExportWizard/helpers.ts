/* Pure helpers for the Export Wizard: its reducer, the install input and the zip download. */
import type {
  CiFile,
  CiInstallInput,
  CiInstallationView,
  CiPostAs,
  CiPreviewInput,
  CiTrigger,
  CiWorkflowCheck,
} from "@devdigest/shared";
import { DEFAULT_TRIGGERS, KNOWN_ERROR_CODES, STEP_PREVIEW, STEP_TARGET, TRIGGERS, WORKFLOW_PATH } from "./constants";

/** What the host (CiTab) asks the wizard to open with (AC-33). `null` = a fresh target repo. */
export interface CiExportRequest {
  installation: CiInstallationView | null;
}

export type InstallMode = "open_pr" | "zip";

export interface WizardState {
  step: number;
  /** `null` = follow the default (the active GitHub repo), so it is derived, not stored. */
  repoId: string | null;
  triggers: CiTrigger[];
  postAs: CiPostAs;
  /** The hand-edited workflow; `null` = the generated one. */
  workflowEdit: string | null;
  selectedPath: string | null;
  mode: InstallMode;
  /** Result of the last workflow check, kept so the refusal stays visible. */
  check: CiWorkflowCheck | null;
}

export type WizardAction =
  | { type: "go"; step: number }
  | { type: "setRepo"; repoId: string }
  | { type: "toggleTrigger"; trigger: CiTrigger }
  | { type: "setPostAs"; postAs: CiPostAs }
  | { type: "editWorkflow"; text: string }
  | { type: "selectFile"; path: string }
  | { type: "setMode"; mode: InstallMode }
  | { type: "setCheck"; check: CiWorkflowCheck | null };

/** Update CI config (AC-33) opens at Preview with the saved choices; a fresh export starts at Target. */
export function initialState(request: CiExportRequest): WizardState {
  const i = request.installation;
  const resumable = i !== null && i.repo_id !== null;
  return {
    step: resumable ? STEP_PREVIEW : STEP_TARGET,
    repoId: resumable ? i.repo_id : null,
    triggers: resumable && i.triggers.length > 0 ? [...i.triggers] : [...DEFAULT_TRIGGERS],
    postAs: resumable ? i.post_as : "github_review",
    workflowEdit: null,
    selectedPath: null,
    mode: "open_pr",
    check: null,
  };
}

/** A regenerated workflow discards hand edits and the check that belonged to them. */
const regenerated = { workflowEdit: null, check: null } as const;

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "go":
      return { ...state, step: action.step };
    case "setRepo":
      return { ...state, repoId: action.repoId, selectedPath: null, ...regenerated };
    case "toggleTrigger": {
      const on = state.triggers.includes(action.trigger);
      if (on && state.triggers.length === 1) return state; // at least one stays on
      const next = on ? state.triggers.filter((x) => x !== action.trigger) : [...state.triggers, action.trigger];
      return { ...state, triggers: TRIGGERS.filter((x) => next.includes(x)), ...regenerated };
    }
    case "setPostAs":
      return { ...state, postAs: action.postAs, ...regenerated };
    case "editWorkflow":
      return { ...state, workflowEdit: action.text, check: null };
    case "selectFile":
      return { ...state, selectedPath: action.path };
    case "setMode":
      return { ...state, mode: action.mode };
    case "setCheck":
      return { ...state, check: action.check };
  }
}

export function previewInputOf(state: WizardState, repoId: string | null): CiPreviewInput | null {
  if (state.step < STEP_PREVIEW || !repoId) return null;
  return { repo_id: repoId, triggers: state.triggers, post_as: state.postAs };
}

export function installInputOf(state: WizardState, repoId: string, mode: InstallMode): CiInstallInput {
  return {
    repo_id: repoId,
    triggers: state.triggers,
    post_as: state.postAs,
    mode,
    ...(state.workflowEdit !== null ? { workflow: state.workflowEdit } : {}),
  };
}

export function workflowFileOf(files: readonly CiFile[]): CiFile | undefined {
  return files.find((f) => f.path === WORKFLOW_PATH) ?? files.find((f) => f.path.startsWith(".github/workflows/"));
}

/** The workflow text as the user currently sees it. */
export function workflowTextOf(state: WizardState, files: readonly CiFile[]): string {
  return state.workflowEdit ?? workflowFileOf(files)?.contents ?? "";
}

/** What the server tells about the commit that blocks `devdigest/ci`. Untrusted: every field is checked and rendered as text. */
export interface ForeignCommitInfo {
  truncated: boolean;
  sha: string | null;
  author: string | null;
  date: string | null;
  subject: string | null;
  aheadCount: number;
  branchUrl: string | null;
}

export function foreignCommitOf(details: unknown): ForeignCommitInfo | null {
  if (typeof details !== "object" || details === null) return null;
  const d = details as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
  return {
    truncated: d.truncated === true,
    sha: str(d.sha),
    author: str(d.author),
    date: str(d.date),
    subject: str(d.subject),
    aheadCount: Number.isInteger(d.ahead_count) && (d.ahead_count as number) >= 0 ? (d.ahead_count as number) : 0,
    branchUrl: str(d.branch_url),
  };
}

/** "2026-07-08T10:00:00Z" → "2026-07-08"; anything else is shown as the server sent it. */
export function shortDateOf(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}T/.test(iso) ? iso.slice(0, 10) : iso;
}

export function errorKeyOf(code: string | undefined): string {
  return code && (KNOWN_ERROR_CODES as readonly string[]).includes(code) ? code : "generic";
}

/** "Update CI config" with the repo already chosen needs no Target hint; true when this repo is installed. */
export function isInstalledOn(installation: CiInstallationView | null, repoId: string | null): boolean {
  return installation !== null && repoId !== null && installation.repo_id === repoId;
}

/** Download the base64 zip as a file; the object URL is revoked after a delay, so the browser has started the download. */
export function downloadZip(base64: string, filename: string): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
