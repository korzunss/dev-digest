import type {
  BlastRadius,
  BriefMissingInput,
  PrIntentResponse,
  SmartDiffResponse,
  SmartDiffRole,
} from '@devdigest/shared';
import type { PullRow } from '../../db/rows.js';
import type { LineRange } from '../_shared/diff-hunks.js';
import type { BriefRepoRow } from './repository.js';

export type { BriefRepoRow };

/** Token counter, injected so the pure budget code never owns an encoder. */
export interface TokenCounter {
  count(text: string): number;
}

export interface BriefFileFact {
  path: string;
  additions: number;
  deletions: number;
  role: SmartDiffRole | null;
  /** New-file line ranges per hunk. Never the patch body (AC-10). */
  ranges: LineRange[];
}

export interface BriefBlastFacts {
  changed_symbols: { name: string; file: string; kind: string }[];
  callers: { symbol: string; name: string; file: string; line: number }[];
  endpoints: string[];
  crons: string[];
  degraded: boolean;
  reason: string | null;
}

/** Everything the model sees. Bounded and body-free by construction. */
export interface BriefFacts {
  pr: { title: string; author: string; branch: string; base: string; head_sha: string };
  files: BriefFileFact[];
  intent: {
    intent: string;
    in_scope: string[];
    out_of_scope: string[];
    confidence: string;
    stale: boolean;
  } | null;
  blast: BriefBlastFacts | null;
  findings: { file: string; line: number; severity: string; title: string }[];
  description: string;
  issues: { ref: string; title: string; body: string }[];
  docs: { path: string; body: string }[];
}

export interface FitResult {
  facts: BriefFacts;
  /** Inputs cut to fit, each once, as `truncated` entries. */
  truncated: BriefMissingInput[];
}

// ---- structural ports the service depends on (satisfied by existing services) ----

export interface BriefLogger {
  info(obj: object | string, msg?: string): void;
  warn(obj: object | string, msg?: string): void;
}

export interface BriefIntentPort {
  get(workspaceId: string, prId: string): Promise<PrIntentResponse | undefined>;
  readLinkedIssues(
    pull: PullRow,
    repo: BriefRepoRow,
  ): Promise<{
    issues: { ref: string; title: string; body: string }[];
    failed: { ref: string; reason: string }[];
  }>;
}

export interface BriefBlastPort {
  getBlast(workspaceId: string, prId: string, log: BriefLogger): Promise<BlastRadius | undefined>;
}

export interface BriefSmartDiffPort {
  get(workspaceId: string, prId: string): Promise<SmartDiffResponse | undefined>;
}

export interface BriefAgentsPort {
  listEnabled(workspaceId: string): Promise<{ id: string }[]>;
  listContextDocs(agentId: string): Promise<{ path: string }[]>;
  inheritedContextDocs(agentId: string): Promise<{ path: string }[]>;
}

export interface BriefContextPort {
  readDocsForRun(
    repo: { owner: string; name: string; contextGlobs: string[] },
    paths: string[],
  ): Promise<{
    docs: { path: string; body: string }[];
    skipped: { path: string; reason: string }[];
  }>;
}
