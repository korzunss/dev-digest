import type {
  Agent,
  BlastRadius,
  ConventionScanResult,
  PrMeta,
  Repo,
  ReviewRecord,
  ReviewRunResponse,
  RunSummary,
} from '@devdigest/shared';

/** What the tools need from DevDigest. Implemented by `http/client.ts`; the core never sees a URL. */
export interface DevDigestApi {
  listRepos(): Promise<Repo[]>;
  listPulls(repoId: string): Promise<PrMeta[]>;
  listAgents(): Promise<Agent[]>;
  triggerReview(pullId: string, agentId: string): Promise<ReviewRunResponse>;
  listRuns(pullId: string): Promise<RunSummary[]>;
  listReviews(pullId: string): Promise<ReviewRecord[]>;
  getConventions(repoId: string): Promise<ConventionScanResult>;
  getBlast(pullId: string): Promise<BlastRadius>;
}

/** Injected time source so the run-wait loop stays pure and testable. */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}
