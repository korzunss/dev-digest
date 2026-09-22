/* hooks/conventions.ts — React Query hooks for the Conventions screen: the
   extraction run, the accept/reject/edit decisions on each candidate, and the
   preview → create flow that turns the accepted set into a Skill.

     GET   /repos/:id/conventions                 → ConventionScanResult (latest scan)
     POST  /repos/:id/conventions/extract         → ConventionScanResult (new scan)
     PATCH /conventions/:id                       → ConventionCandidate
     POST  /repos/:id/conventions/skill/preview   → ConventionSkillPreview[]
     POST  /repos/:id/conventions/skill           → Skill[] */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionScanResult,
  ConventionSkillPreview,
  ConventionStatus,
  Skill,
  SkillType,
} from "@devdigest/shared";

/** The latest scan for a repo, with its candidates. `scan` is null before the
    first extraction — an empty result, not an error. */
export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionScanResult>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/**
 * Run an extraction. Synchronous server-side (one model call over ~20 sampled
 * files), so the response IS the new scan — written straight into the cache
 * rather than invalidated, which would throw away the result we just paid a
 * model call for and fetch it again.
 */
export function useExtractConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<ConventionScanResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data, repoId) => qc.setQueryData(["conventions", repoId], data),
  });
}

/** Accept, reject, or inline-edit one candidate. */
export interface UpdateConventionInput {
  id: string;
  patch: {
    rule?: string;
    category?: ConventionCategory;
    status?: ConventionStatus;
  };
}

export function useUpdateConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionInput) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    // The repo comes off the response rather than the variables: a candidate
    // knows which repo it belongs to, and the card that triggered this does not
    // have to thread the id through to keep the list honest.
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ["conventions", data.repo_id] }),
  });
}

/**
 * Build the skill(s) the accepted candidates WOULD produce, storing nothing.
 * Same shape as the import drawer's preview step and for the same reason:
 * closing the modal has to leave no row behind. `split` returns one preview per
 * category instead of one merged skill.
 */
export function useConventionSkillPreview() {
  return useMutation({
    mutationFn: ({ repoId, split }: { repoId: string; split?: boolean }) =>
      api.post<ConventionSkillPreview[]>(`/repos/${repoId}/conventions/skill/preview`, {
        split: !!split,
      }),
  });
}

/** One preview as the modal hands it back — every field editable, plus the
    enabled toggle the preview contract has no opinion about. */
export interface ConventionSkillDraft {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
}

/**
 * Commit the edited preview(s). `candidate_ids` is sent so the server can mark
 * which candidates were folded into which skill — it re-derives the accepted
 * set itself and refuses anything not accepted, so this list is a claim, not
 * the authority.
 */
export function useCreateConventionSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      repoId,
      skills,
      candidateIds,
    }: {
      repoId: string;
      skills: ConventionSkillDraft[];
      candidateIds: string[];
    }) =>
      api.post<Skill[]>(`/repos/${repoId}/conventions/skill`, {
        skills,
        candidate_ids: candidateIds,
      }),
    onSuccess: (_data, { repoId }) => {
      // The Skills Lab rail has a new entry…
      qc.invalidateQueries({ queryKey: ["skills"] });
      // …and every candidate it consumed now carries its skill_id.
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}
