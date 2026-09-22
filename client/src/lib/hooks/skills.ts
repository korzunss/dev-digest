/* hooks/skills.ts — React Query hooks for the Skills Lab (rail + tabbed editor),
   the import drawer, and the agent editor's Skills tab. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentSkillLink,
  Skill,
  SkillContextLink,
  SkillImportPreview,
  SkillSource,
  SkillStats,
  SkillType,
  SkillVersion,
  SpecFile,
} from "@devdigest/shared";

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">> & {
    /**
     * The author's note on what changed, stored on the version this save
     * appends. Not a field of the skill — a skill has no "message", the
     * SNAPSHOT does — which is why it lives on the patch rather than in the
     * `Pick` above.
     */
    message?: string;
  };
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      // A body change appends a version; the history view must not go stale.
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
      // Deleting a skill drops its agent links server-side (cascade), so any
      // cached attachment list is now wrong.
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}

/** What the import drawer sends: a markdown file, an archive, or a URL. */
export type ImportSkillInput =
  | { kind: "md"; filename: string; content: string }
  | { kind: "zip"; filename: string; content_b64: string }
  | { kind: "url"; url: string };

/**
 * Parse an incoming skill WITHOUT storing it. The drawer shows the result and
 * only a confirmed preview is sent on to `useCreateSkill` — so closing the
 * drawer leaves nothing behind.
 */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (input: ImportSkillInput) =>
      api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}

/** The ordered skills attached to one agent. */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/**
 * Attach / detach / reorder in one call: the whole ordered id list is posted,
 * because order is part of the value (it is the order of the blocks in the
 * assembled prompt), not a separate operation.
 */
export function useSetAgentSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, skillIds }: { agentId: string; skillIds: string[] }) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onSuccess: (data, { agentId }) => {
      qc.setQueryData(["agent-skills", agentId], data);
      // The agent card shows the attached count.
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

// ---- Stats -----------------------------------------------------------------

/**
 * Per-skill usage figures for the Stats tab.
 *
 * Kept out of `useSkill`: the rollups need joins across runs and findings that
 * a plain skill read has no reason to pay for, and the tab that shows them is
 * one of six.
 */
export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-stats", id],
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

// ---- Project context -------------------------------------------------------

/** The project-context documents attached to a skill, in prompt order. */
export function useSkillContext(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-context", id],
    queryFn: () => api.get<SkillContextLink[]>(`/skills/${id}/context`),
    enabled: !!id,
  });
}

/**
 * Replace a skill's context attachments wholesale — the whole ordered path list
 * is sent, for the same reason `useSetAgentSkills` posts the whole id list:
 * the order is part of the value, not a separate operation.
 *
 * Attaching a document does NOT change the skill or its versions: the body is
 * untouched and no snapshot is appended, so only `["skill-context", id]` goes
 * stale here.
 */
export function useSetSkillContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, paths }: { id: string; paths: string[] }) =>
      api.put<SkillContextLink[]>(`/skills/${id}/context`, { paths }),
    onSuccess: (data, { id }) => qc.setQueryData(["skill-context", id], data),
  });
}

// ---- Versions --------------------------------------------------------------

/** The unified diff between two stored versions of one skill's body. */
export interface SkillVersionDiff {
  from: number;
  to: number;
  patch: string;
}

export function useVersionDiff(
  id: string | null | undefined,
  from: number | null | undefined,
  to: number | null | undefined,
) {
  return useQuery({
    queryKey: ["skill-version-diff", id, from, to],
    queryFn: () =>
      api.get<SkillVersionDiff>(`/skills/${id}/versions/diff?from=${from}&to=${to}`),
    enabled: !!id && from != null && to != null,
  });
}

/**
 * Restore an old body. This does not rewind history — it APPENDS a new version
 * carrying the old text, because eval runs reference versions by number and a
 * rewritten v3 would silently change what a scored run was scored against.
 *
 * So a restore touches everything a save touches: the skill itself (new
 * `version`, new `body`) and the version list.
 */
export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, message }: { id: string; version: number; message?: string }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`, message ? { message } : undefined),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.setQueryData(["skill", data.id], data);
      qc.invalidateQueries({ queryKey: ["skill-versions", data.id] });
    },
  });
}

// ---- Repo context documents ------------------------------------------------

/**
 * The context documents available in a repo — the pool the Context tab picks
 * from. Keyed by repo because a workspace holds several, and a path only means
 * something inside one of them.
 */
export function useContextDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context-docs", repoId],
    queryFn: () => api.get<SpecFile[]>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

/** One context document with its content — the preview behind an attached path. */
export function useContextDoc(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["context-doc", repoId, path],
    queryFn: () =>
      api.get<SpecFile>(`/repos/${repoId}/context/doc?path=${encodeURIComponent(path!)}`),
    enabled: !!repoId && !!path,
  });
}
