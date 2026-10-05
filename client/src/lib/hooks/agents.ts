/* hooks/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { changedPaths, invalidateContextDocs } from "./context";
import type { Agent, AgentContext, ModelInfo, Provider, ReviewStrategy } from "@devdigest/shared";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => api.get<Agent[]>("/agents"),
  });
}

export function useAgent(id: string | null | undefined) {
  return useQuery({
    queryKey: ["agent", id],
    queryFn: () => api.get<Agent>(`/agents/${id}`),
    enabled: !!id,
  });
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  enabled?: boolean;
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) => api.post<Agent>("/agents", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export interface UpdateAgentInput {
  id: string;
  patch: Partial<
    Pick<
      Agent,
      | "name"
      | "description"
      | "provider"
      | "model"
      | "system_prompt"
      | "output_schema"
      | "strategy"
      | "ci_fail_on"
      | "repo_intel"
      | "enabled"
    >
  >;
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateAgentInput) => api.put<Agent>(`/agents/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.setQueryData(["agent", data.id], data);
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/agents/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.removeQueries({ queryKey: ["agent", id] });
    },
  });
}

/** Dynamic model list for a provider (editor model picker). */
export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: ["provider-models", provider],
    queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}

// ---- Project context -------------------------------------------------------

/**
 * The project-context documents an agent carries: its own links in prompt
 * order, plus the read-only `inherited` ones that arrive through its enabled
 * skills.
 */
export function useAgentContext(id: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-context", id],
    queryFn: () => api.get<AgentContext>(`/agents/${id}/context`),
    enabled: !!id,
  });
}

/**
 * Replace an agent's own context links wholesale — the whole ordered path list
 * is sent, since order is the order the documents reach the model. Same
 * optimistic pattern as `useSetSkillContext`: reordering is repeated keypresses
 * and each one recomputes from the cache. `inherited` is not touched by this
 * request, so it is kept as cached until the response replaces it.
 */
export function useSetAgentContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, paths }: { id: string; paths: string[] }) =>
      api.put<AgentContext>(`/agents/${id}/context`, { paths }),
    onMutate: async ({ id, paths }) => {
      await qc.cancelQueries({ queryKey: ["agent-context", id] });
      const previous = qc.getQueryData<AgentContext>(["agent-context", id]);
      qc.setQueryData<AgentContext | undefined>(["agent-context", id], (prev) =>
        prev
          ? { ...prev, links: paths.map((path, order) => ({ agent_id: id, path, order })) }
          : prev,
      );
      return { previous };
    },
    onError: (_err, { id }, context) => {
      if (context?.previous) qc.setQueryData(["agent-context", id], context.previous);
    },
    onSuccess: (data, { id }, context) => {
      qc.setQueryData(["agent-context", id], data);
      // "Used by N agents" on the page changed, for the added/removed paths only.
      // A skill's own count is not touched by an agent's own links.
      const before = context?.previous?.links.map((l) => l.path);
      invalidateContextDocs(
        qc,
        changedPaths(
          before,
          data.links.map((l) => l.path),
        ),
      );
    },
  });
}
