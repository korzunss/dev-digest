/* hooks/eval.ts — React Query hooks for the eval pipeline (spec 011).

     GET    /agents/:id/eval-cases        → EvalSuiteCase[]
     POST   /agents/:id/eval-cases        → EvalSuiteCase (saves a case)
     PUT    /eval-cases/:id               → EvalSuiteCase
     DELETE /eval-cases/:id               → 204
     POST   /eval-cases/:id/runs          → EvalSuiteCase (single-case run; paid)
     GET    /findings/:id/eval-draft      → EvalDraftSeed (writes nothing)
     POST   /agents/:id/eval-draft-runs   → EvalDraftRunResult (paid, persists nothing)
     POST   /agents/:id/eval-runs         → EvalSuiteRun (starts a suite run; paid)
     GET    /skills/:id/eval-cases        → EvalSuiteCase[]
     POST   /skills/:id/eval-cases        → EvalSuiteCase (saves a skill case)
     POST   /skills/:id/eval-draft-runs   → EvalDraftRunResult (paid, persists nothing)
     POST   /skills/:id/eval-runs         → EvalSkillRunState (starts the skill suite; paid)
     GET    /skills/:id/eval-run          → EvalSkillRunState (progress + default pick)
     GET    /skills/:id/eval-run-agents   → EvalSkillRunAgentsPreview
     POST   /skills/:id/eval-run-agents   → EvalRunAllResult ("Run on evals"; paid)
     GET    /agents/:id/eval?period=      → EvalAgentDetail
     GET    /eval-runs/:id                → EvalSuiteRunDetail
     GET    /eval-runs/compare?a=&b=      → EvalCompare
     POST   /eval-runs/:id/promote        → EvalPromoteResult
     GET    /eval/dashboard               → EvalDashboardView
     GET    /eval/run-all                 → EvalRunAllPreview
     POST   /eval/run-all                 → EvalRunAllResult (paid)

   The error envelope's `code` / `details` arrive on ApiError (see api.ts). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  EvalAgentDetail,
  EvalCaseRunBody,
  EvalCaseSaveBody,
  EvalCompare,
  EvalDashboardView,
  EvalDraftRunBody,
  EvalDraftRunResult,
  EvalDraftSeed,
  EvalModelPick,
  EvalPeriod,
  EvalPromoteResult,
  EvalRunAllPreview,
  EvalRunAllResult,
  EvalSkillDraftRunBody,
  EvalSkillRunAgentsPreview,
  EvalSkillRunBody,
  EvalSkillRunState,
  EvalSuiteCase,
  EvalSuiteRun,
  EvalSuiteRunDetail,
} from "@devdigest/shared";
import type { EvalSkillSuiteCase } from "@devdigest/shared/contracts/skill-scope.js";

/** Poll interval while a suite run is in progress server-side. */
const RUN_POLL_MS = 2000;

/** Who owns an eval case: a reviewer agent or a skill (spec 011, AC-81+). */
export type EvalOwner = { kind: "agent"; agentId: string } | { kind: "skill"; skillId: string };

const casesKey = (agentId: string | null | undefined) => ["eval-cases", agentId] as const;
const detailKey = (agentId: string | null | undefined, period?: EvalPeriod) =>
  period ? (["eval-detail", agentId, period] as const) : (["eval-detail", agentId] as const);
const runKey = (runId: string | null | undefined) => ["eval-run", runId] as const;
const skillCasesKey = (skillId: string | null | undefined) => ["skill-eval-cases", skillId] as const;
const skillRunKey = (skillId: string | null | undefined) => ["skill-eval-run", skillId] as const;
const skillRunOnEvalsKey = (skillId: string | null | undefined) =>
  ["skill-run-on-evals", skillId] as const;
const dashboardKey = ["eval-dashboard"] as const;
const compareKey = (a: string | null | undefined, b: string | null | undefined) =>
  ["eval-compare", a, b] as const;
const runAllPreviewKey = ["eval-run-all-preview"] as const;

export function useEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: casesKey(agentId),
    queryFn: () => api.get<EvalSuiteCase[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

export function useEvalAgentDetail(agentId: string | null | undefined, period: EvalPeriod) {
  return useQuery({
    queryKey: detailKey(agentId, period),
    queryFn: () => api.get<EvalAgentDetail>(`/agents/${agentId}/eval?period=${period}`),
    enabled: !!agentId,
  });
}

/** One suite run with its per-case results. Polls every 2 s while it is running. */
export function useEvalRun(runId: string | null | undefined) {
  return useQuery({
    queryKey: runKey(runId),
    queryFn: () => api.get<EvalSuiteRunDetail>(`/eval-runs/${runId}`),
    enabled: !!runId,
    refetchInterval: (query) => (query.state.data?.status === "running" ? RUN_POLL_MS : false),
  });
}

export function useEvalDashboard() {
  return useQuery({
    queryKey: dashboardKey,
    queryFn: () => api.get<EvalDashboardView>("/eval/dashboard"),
  });
}

export function useEvalCompare(a: string | null | undefined, b: string | null | undefined) {
  return useQuery({
    queryKey: compareKey(a, b),
    queryFn: () =>
      api.get<EvalCompare>(
        `/eval-runs/compare?a=${encodeURIComponent(a ?? "")}&b=${encodeURIComponent(b ?? "")}`,
      ),
    enabled: !!a && !!b,
  });
}

/** Seed for the modal. A mutation, not a query: it fires on a click, must
    always hit the server (the finding may have been decided or its case
    saved since), and a refusal (`no_diff_text`, `agent_missing`, …) is read
    off the rejected ApiError. The endpoint writes nothing. */
export function useEvalDraftSeed() {
  return useMutation({
    mutationFn: (findingId: string) => api.get<EvalDraftSeed>(`/findings/${findingId}/eval-draft`),
  });
}

function invalidateAgentEval(qc: ReturnType<typeof useQueryClient>, agentId: string) {
  qc.invalidateQueries({ queryKey: casesKey(agentId) });
  qc.invalidateQueries({ queryKey: detailKey(agentId) });
  qc.invalidateQueries({ queryKey: dashboardKey });
}

/** A skill suite has no run history or dashboard row: only its case list changes. */
function invalidateOwner(qc: ReturnType<typeof useQueryClient>, owner: EvalOwner) {
  if (owner.kind === "agent") invalidateAgentEval(qc, owner.agentId);
  else qc.invalidateQueries({ queryKey: skillCasesKey(owner.skillId) });
}

export function useSaveEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, body }: { agentId: string; body: EvalCaseSaveBody }) =>
      api.post<EvalSuiteCase>(`/agents/${agentId}/eval-cases`, body),
    onSuccess: (_case, { agentId }) => invalidateAgentEval(qc, agentId),
  });
}

/** `PUT /eval-cases/:id` serves both owners; the owner picks the cache to refresh. */
export function useUpdateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; owner: EvalOwner; body: EvalCaseSaveBody }) =>
      api.put<EvalSuiteCase>(`/eval-cases/${id}`, body),
    onSuccess: (_case, { owner }) => invalidateOwner(qc, owner),
  });
}

export function useDeleteEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; owner: EvalOwner }) => api.del<void>(`/eval-cases/${id}`),
    onSuccess: (_void, { owner }) => invalidateOwner(qc, owner),
  });
}

/** Single saved-case run. Not a suite run: only the case list changes. A skill
    case needs `pick` (the server answers 422 `validation_error` without it);
    an agent case is sent bodyless, as before. */
export function useRunEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, owner, pick }: { id: string; owner: EvalOwner; pick?: EvalCaseRunBody }) =>
      owner.kind === "skill" && pick
        ? api.post<EvalSuiteCase>(`/eval-cases/${id}/runs`, pick)
        : api.post<EvalSuiteCase>(`/eval-cases/${id}/runs`),
    onSuccess: (_case, { owner }) =>
      qc.invalidateQueries({
        queryKey: owner.kind === "agent" ? casesKey(owner.agentId) : skillCasesKey(owner.skillId),
      }),
  });
}

/** Draft run: the result is held by the caller, nothing is cached or persisted. */
export function useRunEvalDraft() {
  return useMutation({
    mutationFn: ({ agentId, body }: { agentId: string; body: EvalDraftRunBody }) =>
      api.post<EvalDraftRunResult>(`/agents/${agentId}/eval-draft-runs`, body),
  });
}

export function useStartEvalRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => api.post<EvalSuiteRun>(`/agents/${agentId}/eval-runs`),
    onSuccess: (_run, agentId) => invalidateAgentEval(qc, agentId),
  });
}

// ---- Skill suites ----------------------------------------------------------

export function useSkillEvalCases(skillId: string | null | undefined) {
  return useQuery({
    queryKey: skillCasesKey(skillId),
    queryFn: () => api.get<EvalSkillSuiteCase[]>(`/skills/${skillId}/eval-cases`),
    enabled: !!skillId,
  });
}

export function useSaveSkillEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, body }: { skillId: string; body: EvalCaseSaveBody }) =>
      api.post<EvalSkillSuiteCase>(`/skills/${skillId}/eval-cases`, body),
    onSuccess: (_case, { skillId }) => qc.invalidateQueries({ queryKey: skillCasesKey(skillId) }),
  });
}

/** Draft run on a skill: the result is held by the caller, nothing is cached. */
export function useRunSkillEvalDraft() {
  return useMutation({
    mutationFn: ({ skillId, body }: { skillId: string; body: EvalSkillDraftRunBody }) =>
      api.post<EvalDraftRunResult>(`/skills/${skillId}/eval-draft-runs`, body),
  });
}

/** Starts the skill's own suite on the picked model (paid). Progress is polled
    through `useSkillEvalRunState`; the server writes no run row. */
export function useStartSkillEvalRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, pick }: { skillId: string; pick: EvalModelPick }) => {
      const body: EvalSkillRunBody = { ...pick, confirm: true };
      return api.post<EvalSkillRunState>(`/skills/${skillId}/eval-runs`, body);
    },
    onSuccess: (state, { skillId }) => {
      qc.setQueryData(skillRunKey(skillId), state);
      qc.invalidateQueries({ queryKey: skillRunKey(skillId) });
    },
  });
}

/** Run state of a skill's suite (progress + default model pick). Polls every
    2 s while `progress` is set; the caller refetches cases when it turns null. */
export function useSkillEvalRunState(skillId: string | null | undefined) {
  return useQuery({
    queryKey: skillRunKey(skillId),
    queryFn: () => api.get<EvalSkillRunState>(`/skills/${skillId}/eval-run`),
    enabled: !!skillId,
    // The default pick and the skill's version must be live for the confirm.
    staleTime: 0,
    refetchInterval: (query) => (query.state.data?.progress ? RUN_POLL_MS : false),
  });
}

/** "Run on evals" preview: which agents using the skill would run. */
export function useRunOnEvalsPreview(skillId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: skillRunOnEvalsKey(skillId),
    queryFn: () => api.get<EvalSkillRunAgentsPreview>(`/skills/${skillId}/eval-run-agents`),
    enabled: !!skillId && enabled,
    // The confirm dialog must show the live case counts, not a cached list.
    staleTime: 0,
  });
}

export function useRunOnEvals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skillId: string) =>
      api.post<EvalRunAllResult>(`/skills/${skillId}/eval-run-agents`, { confirm: true }),
    onSuccess: (_res, skillId) => {
      qc.invalidateQueries({ queryKey: ["eval-detail"] });
      qc.invalidateQueries({ queryKey: dashboardKey });
      qc.invalidateQueries({ queryKey: runAllPreviewKey });
      qc.invalidateQueries({ queryKey: skillRunOnEvalsKey(skillId) });
    },
  });
}

export function useRunAllPreview(enabled = true) {
  return useQuery({
    queryKey: runAllPreviewKey,
    queryFn: () => api.get<EvalRunAllPreview>("/eval/run-all"),
    enabled,
    // The confirm dialog must show the live case counts, not a cached list.
    staleTime: 0,
  });
}

export function useRunAllAgents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalRunAllResult>("/eval/run-all", { confirm: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-detail"] });
      qc.invalidateQueries({ queryKey: dashboardKey });
      qc.invalidateQueries({ queryKey: runAllPreviewKey });
    },
  });
}

export function usePromoteEvalRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId }: { runId: string; agentId: string }) =>
      api.post<EvalPromoteResult>(`/eval-runs/${runId}/promote`),
    onSuccess: (_res, { agentId }) => {
      invalidateAgentEval(qc, agentId);
      qc.invalidateQueries({ queryKey: ["agent", agentId] });
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["eval-compare"] });
    },
  });
}
