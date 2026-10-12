import type { ReviewForecast } from '@devdigest/shared';
import type { BriefBlastPort } from '../brief/types.js';
import { estimateMinutes, logDegraded } from './helpers.js';
import type { ReviewForecastRepository } from './repository.js';
import { countPromptTokens, type TokenCounter } from './tokens.js';
import { isUsableIndex, type ForecastRepoIntel } from './types.js';
import { BRIEF_LLM_TIMEOUT_MS } from '../brief/constants.js';

export interface ReviewForecastServiceDeps {
  repo: Pick<ReviewForecastRepository, 'getPull'>;
  blast: BriefBlastPort;
  tokenizer: TokenCounter;
  repoIntel: ForecastRepoIntel;
}

export class ReviewForecastService {
  constructor(private readonly deps: ReviewForecastServiceDeps) {}

  async forecast(
    workspaceId: string,
    prId: string,
    log: Parameters<BriefBlastPort['getBlast']>[2],
  ): Promise<ReviewForecast | undefined> {
    const pull = await this.deps.repo.getPull(workspaceId, prId);
    if (!pull) return undefined;

    const state = await this.deps.repoIntel.getIndexState(pull.repoId);
    const blast = await withDeadline(
      this.deps.blast.getBlast(workspaceId, prId, log),
      BRIEF_LLM_TIMEOUT_MS,
    ).catch((err: Error) => {
      logDegraded(log, prId, err.message);
      return undefined;
    });

    const downstreamFiles = blast ? new Set(blast.downstream.map((d) => d.file)).size : 0;
    const promptTokens = countPromptTokens(this.deps.tokenizer, pull.diff);
    return {
      prId,
      changedFiles: pull.changedFiles,
      downstreamFiles,
      promptTokens,
      estimatedMinutes: estimateMinutes(promptTokens, downstreamFiles),
      indexed: isUsableIndex(state),
    };
  }
}

function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms)),
  ]);
}
