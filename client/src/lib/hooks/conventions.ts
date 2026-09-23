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

/**
 * One preview as the modal hands it back: the SERVER's preview contract plus
 * the enabled toggle, which the preview itself has no opinion about.
 *
 * It extends `ConventionSkillPreview` rather than restating its fields, and
 * that is load-bearing. A hand-written twin of the contract compiles green on
 * both sides while dropping whatever the commit route also requires — here
 * `evidence_files` and `candidate_ids`, whose absence made every Create a 422
 * that neither package's tests could see. Extending the contract makes the
 * omission a typecheck failure instead.
 */
export type ConventionSkillDraft = ConventionSkillPreview & { enabled: boolean };

/**
 * Commit the edited preview(s).
 *
 * `candidate_ids` travels PER SKILL, inside each draft, because a split
 * produces disjoint sets — one per category — and a single shared list could
 * not say which skill consumed which rule. It is a claim either way: the server
 * re-derives the accepted set and refuses anything not in it.
 */
export function useCreateConventionSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      repoId,
      skills,
    }: {
      repoId: string;
      skills: ConventionSkillDraft[];
    }) => api.post<Skill[]>(`/repos/${repoId}/conventions/skill`, { skills }),
    onSuccess: (_data, { repoId }) => {
      // The Skills Lab rail has a new entry…
      qc.invalidateQueries({ queryKey: ["skills"] });
      // …and every candidate it consumed now carries its skill_id.
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}
