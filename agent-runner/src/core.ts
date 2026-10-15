// Pure part of the runner: parsing, skip rules, result building, gate, post plan.
// No I/O here — main.ts owns files, git, fetch and the model call.
import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import {
  AgentManifest,
  CiResultArtifact,
  type CiFailOn,
  type CiPostAs,
  type CiRunStatus,
  type Review,
  type UnifiedDiff,
} from '@devdigest/shared';
import { gateTriggered, toReviewPayload } from '@devdigest/reviewer-core';

const Sha = z.string().regex(/^[0-9a-f]{40}$/, 'must be a 40-hex SHA');
const RepoName = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'must be owner/name');

/** Only the event fields the runner needs; everything else is ignored. */
const PullRequestEvent = z.object({
  pull_request: z.object({
    number: z.number().int().min(1),
    base: z.object({ sha: Sha, repo: z.object({ full_name: RepoName }) }),
    // `head.repo` is null when the fork was deleted — treated as a fork.
    head: z.object({ sha: Sha, repo: z.object({ full_name: RepoName }).nullable() }),
  }),
});

export interface ParsedEvent {
  number: number;
  baseSha: string;
  headSha: string;
  baseRepo: string;
  /** null = the head repository is gone (deleted fork). */
  headRepo: string | null;
}

/** Parse the `GITHUB_EVENT_PATH` JSON. Throws an Error naming the bad field. */
export function parseEvent(json: string): ParsedEvent {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('event payload is not valid JSON');
  }
  const r = PullRequestEvent.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new Error(`event payload invalid at ${i?.path.join('.') || '(root)'}: ${i?.message ?? 'invalid'}`);
  }
  const pr = r.data.pull_request;
  return {
    number: pr.number,
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
    baseRepo: pr.base.repo.full_name,
    headRepo: pr.head.repo?.full_name ?? null,
  };
}

/** A notice string when the review must be skipped (exit 0, no result), else null (AC-41). */
export function shouldSkip(input: { event: ParsedEvent; apiKey: string | undefined }): string | null {
  const { event, apiKey } = input;
  if (event.headRepo === null || event.headRepo.toLowerCase() !== event.baseRepo.toLowerCase()) {
    return 'DevDigest: pull request comes from a fork; secrets are not available, skipping the review';
  }
  if (!apiKey) return 'DevDigest: OPENROUTER_API_KEY is not available, skipping the review';
  return null;
}

/** Parse + validate the exported manifest (AC-38). Throws an Error naming the field. */
export function loadManifest(text: string): AgentManifest {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    throw new Error(`manifest is not valid YAML: ${err instanceof Error ? err.message.split('\n')[0] : 'parse error'}`);
  }
  const r = AgentManifest.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new Error(`manifest invalid at ${i?.path.join('.') || '(root)'}: ${i?.message ?? 'invalid'}`);
  }
  return r.data;
}

/** Everything `buildResult` needs. No key/token field exists, by design (AC-44). */
export interface ResultInput {
  /** null when the run failed before a review existed. */
  review: Review | null;
  failOn: CiFailOn;
  /** Set for a failed run; the class name only, never a message. */
  errorClass: string | null;
  costUsd: number | null;
  durationMs: number;
  tokensIn: number;
  tokensOut: number;
  manifest: { schemaVersion: number; agentName: string; agentVersion: number; model: string };
  runnerVersion: string;
  deps: Record<string, string>;
  nodeVersion: string;
  commitSha: string;
  runId: number;
  runAttempt: number;
}

export function buildResult(input: ResultInput): CiResultArtifact {
  const findings = input.review?.findings ?? [];
  const count = (s: string) => findings.filter((f) => f.severity === s).length;
  // The gate comes from severities, never from the model's verdict.
  const gateTripped = input.review ? gateTriggered(findings, input.failOn) : false;
  const status: CiRunStatus = input.errorClass !== null || !input.review ? 'error' : gateTripped ? 'gate_failed' : 'passed';
  return CiResultArtifact.parse({
    schema_version: 1,
    status,
    verdict: input.review?.verdict ?? null,
    gate_tripped: gateTripped,
    findings_count: findings.length,
    critical: count('CRITICAL'),
    warning: count('WARNING'),
    suggestion: count('SUGGESTION'),
    cost_usd: input.costUsd,
    duration_ms: Math.max(0, Math.round(input.durationMs)),
    tokens_in: input.tokensIn,
    tokens_out: input.tokensOut,
    manifest_schema_version: input.manifest.schemaVersion,
    agent_name: input.manifest.agentName.slice(0, 200),
    agent_version: input.manifest.agentVersion,
    model: input.manifest.model.slice(0, 200),
    runner_version: input.runnerVersion.slice(0, 50),
    deps: input.deps,
    node_version: input.nodeVersion.slice(0, 50),
    commit_sha: input.commitSha,
    run_id: input.runId,
    run_attempt: input.runAttempt,
    error_class: input.errorClass === null ? null : input.errorClass.slice(0, 100),
  });
}

/** 1 for a tripped gate or an error (AC-40/42), else 0. */
export function exitCode(result: Pick<CiResultArtifact, 'status'>): 0 | 1 {
  return result.status === 'gate_failed' || result.status === 'error' ? 1 : 0;
}

export type PostPlan =
  | { kind: 'review'; payload: ReturnType<typeof toReviewPayload> }
  | { kind: 'comment'; body: string }
  | { kind: 'none' };

/** What to post to the PR for the chosen mode (AC-39). */
export function postPlan(
  postAs: CiPostAs,
  review: Review,
  opts: { failOn: CiFailOn; diff: UnifiedDiff },
): PostPlan {
  if (postAs === 'none') return { kind: 'none' };
  if (postAs === 'pr_comment') {
    return { kind: 'comment', body: toReviewPayload(review, { inline: false, failOn: opts.failOn }).body };
  }
  return { kind: 'review', payload: toReviewPayload(review, { failOn: opts.failOn, diff: opts.diff }) };
}
