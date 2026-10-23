import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, CiInstallInput, CiInstallResult, CiInstallationView, CiPreview, CiWorkflowCheck, Repo } from "@devdigest/shared";
import ciMessages from "../../../../../../../../messages/en/ci.json";
import { ApiError } from "@/lib/api";
import { shouldToastMutationError } from "@/lib/providers";
import { initialState, wizardReducer } from "./helpers";

const WORKFLOW = ".github/workflows/devdigest-review.yml";
const previewCalls: unknown[] = [];
const validateCalls: unknown[] = [];
const installCalls: CiInstallInput[] = [];
let previewData: CiPreview;
let checkResult: CiWorkflowCheck;
let installedList: CiInstallationView[];
let installOutcome: { result?: CiInstallResult; error?: unknown };

vi.mock("@/lib/hooks/ci", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/hooks/ci")>()),
  useCiInstallations: () => ({ data: installedList }),
  useCiPreview: (_id: string, input: unknown) => {
    previewCalls.push(input);
    return { data: input ? previewData : undefined, isLoading: false, isError: false, isFetching: false };
  },
  useValidateCiWorkflow: () => ({
    isPending: false,
    mutate: (input: unknown, opts: { onSuccess: (c: CiWorkflowCheck) => void }) => {
      validateCalls.push(input);
      opts.onSuccess(checkResult);
    },
  }),
  useCiInstall: () => {
    const [data, setData] = React.useState<CiInstallResult | undefined>();
    const [error, setError] = React.useState<unknown>();
    return {
      data,
      error,
      isError: error !== undefined,
      isPending: false,
      mutate: (input: CiInstallInput, opts?: { onSuccess?: (r: CiInstallResult) => void }) => {
        installCalls.push(input);
        if (installOutcome.error) return setError(installOutcome.error);
        setError(undefined);
        setData(installOutcome.result);
        opts?.onSuccess?.(installOutcome.result!);
      },
    };
  },
}));

let attachedSkills: { skill_id: string }[] = [];
let allSkills: { id: string; paths: string[] }[] = [];
vi.mock("@/lib/hooks/skills", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/hooks/skills")>()),
  useAgentSkills: () => ({ data: attachedSkills }),
  useSkills: () => ({ data: allSkills }),
}));

let reposList: Repo[];
const REPOS = [
  { id: "r1", provider: "github", full_name: "acme/payments-api" },
  { id: "r2", provider: "github", full_name: "acme/billing-worker" },
  { id: "r3", provider: "gitlab", full_name: "acme/on-gitlab" },
] as Repo[];
reposList = REPOS;
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repos: reposList, activeRepo: REPOS[0], repoId: "r1", reposLoaded: true, setRepoId: () => {} }),
}));

import { ExportWizard } from "./ExportWizard";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openrouter",
  model: "x",
  system_prompt: "x",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 3,
};

const installation = (over: Partial<CiInstallationView> = {}): CiInstallationView => ({
  id: "i1",
  agent_id: "ag1",
  repo: "acme/billing-worker",
  repo_id: "r2",
  target_type: "gha",
  mode: "pr",
  exported_agent_version: 3,
  exported_ci_fail_on: "critical",
  workflow_version: 1,
  runner_version: "0.1.0",
  triggers: ["opened"],
  post_as: "pr_comment",
  pr_number: 7,
  pr_url: null,
  installed_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
  pr_state: "merged",
  state: "active",
  out_of_date: false,
  gate_drift: false,
  latest_run: null,
  ...over,
});

function mount(opts: { agent?: Agent; installation?: CiInstallationView | null } = {}) {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
      <ExportWizard agent={opts.agent ?? AGENT} request={{ installation: opts.installation ?? null }} onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return onClose;
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const w = ciMessages.exportWizard;

beforeEach(() => {
  previewCalls.length = validateCalls.length = installCalls.length = 0;
  previewData = {
    files: [
      { path: ".devdigest/agents/security-reviewer.yaml", contents: "name: Security Reviewer", editable: false },
      { path: WORKFLOW, contents: "name: DevDigest Review\non: pull_request", editable: true },
    ],
    file_count: 2,
    existing_installation_id: null,
    blocked: null,
  };
  installedList = [];
  attachedSkills = [];
  allSkills = [];
  reposList = REPOS;
  checkResult = { errors: [], warnings: [] };
  installOutcome = { result: { installation: {} as never, pr_url: "https://github.com/acme/payments-api/pull/9", zip_base64: null } };
});
afterEach(cleanup);

describe("wizardReducer", () => {
  it("keeps one trigger on and drops hand edits when the workflow is regenerated", () => {
    let st = wizardReducer(initialState({ installation: null }), { type: "editWorkflow", text: "x" });
    expect(st.workflowEdit).toBe("x");
    st = wizardReducer(st, { type: "toggleTrigger", trigger: "reopened" });
    expect(st.triggers).toEqual(["opened", "synchronize", "reopened"]);
    expect(st.workflowEdit).toBeNull();
    st = wizardReducer(wizardReducer(st, { type: "toggleTrigger", trigger: "opened" }), { type: "toggleTrigger", trigger: "synchronize" });
    expect(wizardReducer(st, { type: "toggleTrigger", trigger: "reopened" })).toBe(st);
  });
});

describe("ExportWizard", () => {
  it("warns that Applies to is ignored in CI only when an attached skill is scoped", () => {
    attachedSkills = [{ skill_id: "s1" }];
    allSkills = [{ id: "s1", paths: [] }, { id: "s2", paths: ["**/*.ts"] }];
    mount();
    expect(screen.queryByRole("status")).toBeNull();
    cleanup();
    allSkills = [{ id: "s1", paths: ["**/*.ts"] }];
    mount();
    expect(screen.getByRole("status")).toHaveTextContent(w.scopedSkillsNote);
  });

  it("Target: only GitHub Actions is selectable and the active GitHub repo is the default", () => {
    mount();
    expect(screen.getByRole("radio", { name: /GitHub Actions/ })).toBeEnabled();
    expect(screen.getByRole("radio", { name: /GitHub Actions/ })).toBeChecked();
    for (const name of [w.targets.circle, w.targets.jenkins, w.targets.cli]) {
      expect(screen.getByRole("radio", { name: new RegExp(name) })).toBeDisabled();
    }
    expect(screen.getByRole("combobox")).toHaveValue("r1");
    expect(screen.queryByText("acme/on-gitlab")).not.toBeInTheDocument();
    click(w.continue);
    expect(previewCalls.at(-1)).toEqual({ repo_id: "r1", triggers: ["opened", "synchronize"], post_as: "github_review" });
  });

  it("AC-10: '+ Add to CI' on a repo the agent is already installed in shows the note before any preview", () => {
    installedList = [installation({ repo_id: "r1" })];
    mount();
    expect(screen.getByText(w.existingNote)).toBeInTheDocument();
  });

  it("AC-10: no note when the agent is installed only in another repo", () => {
    installedList = [installation({ repo_id: "r2" })];
    mount();
    expect(screen.queryByText(w.existingNote)).not.toBeInTheDocument();
  });

  it("AC-9: with no connected GitHub repo the wizard explains it and cannot continue", () => {
    reposList = [REPOS[2]!];
    mount();
    expect(screen.getByText(w.noGithubRepo)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: w.continue })).toBeDisabled();
  });

  it("Target: blocks a non-OpenRouter agent with the reason", () => {
    mount({ agent: { ...AGENT, provider: "openai" } as Agent });
    expect(screen.getByText(/supports OpenRouter only/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: w.continue })).toBeDisabled();
  });

  it("Update CI config opens at Preview with the saved choices and a note", () => {
    mount({ installation: installation() });
    expect(screen.getByText(w.updateNote)).toBeInTheDocument();
    expect(previewCalls.at(-1)).toEqual({ repo_id: "r2", triggers: ["opened"], post_as: "pr_comment" });
  });

  it("Preview: edits the workflow only, validates it and stops on an error with its line", () => {
    checkResult = { errors: [{ invariant: "differs_from_generated", message: "\"jobs.review.container\" differs", line: 12 }], warnings: [] };
    mount({ installation: installation() });
    fireEvent.click(screen.getByText(".devdigest/agents/security-reviewer.yaml"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(WORKFLOW));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "edited: true" } });
    click(w.continue);
    expect(validateCalls.at(-1)).toEqual({ workflow: "edited: true", triggers: ["opened"], post_as: "pr_comment" });
    expect(screen.getByRole("alert")).toHaveTextContent("differs_from_generated: \"jobs.review.container\" differs (line 12)");
    expect(screen.queryByText(w.steps.configure, { selector: "button" })).not.toBeInTheDocument();
    expect(screen.queryByText(w.triggerLabel)).not.toBeInTheDocument();
  });

  it("AC-15: the workflow badge lists the editable fields and the hint points to Configure and the export PR", () => {
    mount({ installation: installation() });
    expect(screen.getByText(w.editable)).toBeInTheDocument();
    expect(w.editable).toBe("editable: name, timeout, runner");
    expect(screen.getByText(w.workflowEditNote)).toBeInTheDocument();
    fireEvent.click(screen.getByText(".devdigest/agents/security-reviewer.yaml"));
    expect(screen.queryByText(w.workflowEditNote)).not.toBeInTheDocument();
    expect(screen.getByText(w.generated)).toBeInTheDocument();
  });

  it("AC-19: a clean check lets Continue through and shows no alert", () => {
    mount({ installation: installation() });
    click(w.continue);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(w.triggerLabel)).toBeInTheDocument();
  });

  it("Preview: a blocked export shows the reason and cannot continue", () => {
    previewData = { ...previewData, files: [], blocked: { code: "provider_not_openrouter", message: "Switch provider" } };
    mount({ installation: installation() });
    expect(screen.getByText("Switch provider")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: w.continue })).toBeDisabled();
  });

  it("Configure: keeps one trigger on, lists secrets as expected, and the AC-24 advice shows", () => {
    mount({ installation: installation() });
    click(w.continue);
    expect(screen.getByText(w.triggerLabel)).toBeInTheDocument();
    click(/pull_request:opened/);
    expect(previewCalls.at(-1)).toMatchObject({ triggers: ["opened"] });
    click(/pull_request:reopened/);
    expect(previewCalls.at(-1)).toMatchObject({ triggers: ["opened", "reopened"] });
    expect(screen.getByText(w.secretExpected)).toBeInTheDocument();
    expect(screen.getByText(w.secretReady)).toBeInTheDocument();
    expect(screen.getByText(/CODEOWNERS/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(w.postAs.none));
    expect(previewCalls.at(-1)).toMatchObject({ post_as: "none" });
  });

  it("Install: uses the real file count, opens the PR and links it", () => {
    mount({ installation: installation() });
    click(w.continue);
    click(w.continue);
    expect(screen.getByText(/with the 2 generated files/)).toBeInTheDocument();
    click(w.install);
    expect(installCalls.at(-1)).toEqual({ repo_id: "r2", triggers: ["opened"], post_as: "pr_comment", mode: "open_pr" });
    expect(screen.getByText(w.viewPr)).toHaveAttribute("href", "https://github.com/acme/payments-api/pull/9");
    expect(screen.getByRole("button", { name: w.done })).toBeInTheDocument();
  });

  it("Install: a zip is downloaded as devdigest-ci.zip and the object URL is revoked after a delay", () => {
    const create = vi.fn(() => "blob:x");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    installOutcome = { result: { installation: {} as never, pr_url: null, zip_base64: btoa("zip") } };
    mount({ installation: installation() });
    click(w.continue);
    click(w.continue);
    click(new RegExp(w.installZipTitle));
    vi.useFakeTimers();
    click(w.install);
    expect(installCalls.at(-1)).toMatchObject({ mode: "zip" });
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(anchorClick.mock.contexts[0]).toHaveProperty("download", "devdigest-ci.zip");
    anchorClick.mockRestore();
    expect(create).toHaveBeenCalledOnce();
    // Revoked later, so the browser has started the download first.
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    vi.useRealTimers();
    expect(revoke).toHaveBeenCalledWith("blob:x");
    expect(screen.getByText(w.zipDownloaded)).toBeInTheDocument();
  });

  it("Install: a protected branch is explained and a zip is offered", () => {
    installOutcome = { error: new ApiError("nope", 409, "branch_protected") };
    mount({ installation: installation() });
    click(w.continue);
    click(w.continue);
    click(w.install);
    expect(screen.getByRole("alert")).toHaveTextContent(w.errors.branch_protected);
    expect(screen.getByRole("button", { name: w.downloadZipInstead })).toBeInTheDocument();
  });
  const toInstall = (error: ApiError) => {
    installOutcome = { error };
    mount({ installation: installation() });
    click(w.continue);
    click(w.continue);
    click(w.install);
  };

  it("UX-1: foreign_commits names the blocking commit, links the branch and keeps the zip button", () => {
    toInstall(
      new ApiError("nope", 409, "foreign_commits", {
        truncated: false,
        sha: "be3b4eb",
        author: "burnjohn",
        date: "2026-07-08T10:00:00Z",
        subject: "<b>hand</b> edit",
        ahead_count: 3,
        branch_url: "https://github.com/acme/payments-api/tree/devdigest/ci",
      }),
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("be3b4eb by burnjohn on 2026-07-08 — \"<b>hand</b> edit\"");
    expect(alert).toHaveTextContent("3 commits ahead");
    expect(alert.querySelector("b")).toBeNull(); // text node, never HTML
    expect(screen.getByRole("link", { name: "delete the branch on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/tree/devdigest/ci",
    );
    expect(screen.getByRole("button", { name: w.downloadZipInstead })).toBeInTheDocument();
  });

  it("UX-1: the more-than-100-commits case has no sha", () => {
    toInstall(
      new ApiError("nope", 409, "foreign_commits", {
        truncated: true, sha: null, author: null, date: null, subject: null, ahead_count: 100,
        branch_url: "https://github.com/acme/payments-api/tree/devdigest/ci",
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("more than 100 commits");
    expect(screen.getByRole("alert").querySelector("code")?.textContent).toBe("devdigest/ci");
  });

  it("UX-2: missing_workflow_permission shows the token fix inline with both links", () => {
    toInstall(new ApiError("nope", 403, "missing_workflow_permission"));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Classic token: enable the workflow scope.");
    expect(alert).toHaveTextContent("Workflows → Read and write");
    expect(screen.getByRole("link", { name: "github.com/settings/tokens" })).toHaveAttribute("href", "https://github.com/settings/tokens");
    expect(screen.getByRole("link", { name: "Settings → API keys" })).toHaveAttribute("href", "/settings/api-keys");
    expect(screen.getByRole("button", { name: w.downloadZipInstead })).toBeInTheDocument();
  });

  it("UX-2: these two codes are not toasted, unknown errors still are", () => {
    const meta = { inlineErrorCodes: ["missing_workflow_permission", "foreign_commits"] };
    expect(shouldToastMutationError(new ApiError("x", 403, "missing_workflow_permission"), meta)).toBe(false);
    expect(shouldToastMutationError(new ApiError("x", 409, "foreign_commits"), meta)).toBe(false);
    expect(shouldToastMutationError(new ApiError("x", 409, "branch_moved"), meta)).toBe(true);
    expect(shouldToastMutationError(new Error("boom"), meta)).toBe(true);
    expect(shouldToastMutationError(new ApiError("x", 403, "missing_workflow_permission"), undefined)).toBe(true);
  });
});
