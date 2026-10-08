import type { ReviewRecord } from '@devdigest/shared';
import { noReviewText } from '../tools/messages.js';
import { latestReviews } from './findings.js';
import { passScore } from './threshold.js';

export interface AgentScore {
  agent: string | null;
  score: number | null;
  verdict: ReviewRecord['verdict'];
}

export interface ScoreSummary {
  pass_score: number;
  lowest: number | null;
  passed: boolean;
  agents: AgentScore[];
  note?: string;
}

export function scoreSummary(reviews: ReviewRecord[], repo: string, pr: number): ScoreSummary {
  const latest = latestReviews(reviews);
  const threshold = passScore();
  if (latest.length === 0) {
    return { pass_score: threshold, lowest: null, passed: false, agents: [], note: noReviewText(repo, pr) };
  }
  const agents = latest.map((r) => ({ agent: r.agent_name ?? null, score: r.score ?? null, verdict: r.verdict }));
  const scores = agents.map((a) => a.score).filter((s): s is number => s !== null);
  const lowest = scores.length > 0 ? Math.min(...scores) : null;
  return { pass_score: threshold, lowest, passed: lowest !== null && lowest >= threshold, agents };
}
