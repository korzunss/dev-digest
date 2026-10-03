import type {
  LLMProvider,
  LlmRouting,
  LlmUsageReport,
  RunEventKind,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { LlmDeadlineError, LlmOutputTruncatedError, isTransientLlmError } from '../llm/errors.js';

/** How often an in-flight call logs "still waiting" (assumption: 2 min). */
export const LLM_WAIT_HEARTBEAT_MS = 120_000;

/** Assumed generation speed for sizing a deadline-aborted round (slowest observed provider). */
export const DEADLINE_ESTIMATE_TOKENS_PER_SEC = 16;

/** Human-readable routing summary for run-log lines. */
export function describeRouting(r?: LlmRouting, requireParameters?: boolean): string {
  const parts: string[] = [];
  if (r?.sort) parts.push(`sort=${r.sort}`);
  if (requireParameters) parts.push('require_parameters');
  return parts.length ? parts.join(' · ') : 'default';
}

export interface CallWithDeadlineOptions<T> {
  llm: LLMProvider;
  request: Omit<StructuredRequest<T>, 'signal' | 'onUsage'>;
  /** Prices a deadline-aborted round; absent or null result ⇒ those tokens are counted unpriced. */
  estimateCost?: (model: string, tokensIn: number, tokensOut: number) => number | null;
  /** Token counter for the aborted round's input when no round reported; absent ⇒ chars / 4. */
  countTokens?: (s: string) => number;
  /** Routing for the single retry (replaces `request.routing`; `requireParameters` kept). */
  retryRouting?: LlmRouting;
  /** Per-attempt deadline; unset = no deadline. */
  deadlineMs?: number;
  /** Caller cancellation (run cancel). */
  signal?: AbortSignal;
  label: string;
  emit: (kind: RunEventKind, msg: string) => void;
  /** Throws the caller's cancel error when the run was cancelled. */
  checkCancelled?: () => void;
  /**
   * Called once, just before a non-cancel final throw, with the usage of every failed
   * attempt of this call; not called when nothing was reported and no deadline fired,
   * nor on cancel. Emits no run-log line: the caller decides whether it is counted.
   */
  onFinalFailure?: (u: FailedCallUsage) => void;
}

/** Usage of a failed attempt, to be merged into the retry's result. */
export interface FailedCallUsage {
  tokensIn: number;
  tokensOut: number;
  /** Sum of the priced parts. */
  costUsd: number;
  deadline: boolean;
  /** Any part was not a real API cost. */
  estimated: boolean;
  /** Any part had no price at all. */
  unpriced: boolean;
}

function sumFailed(a?: FailedCallUsage, b?: FailedCallUsage): FailedCallUsage | undefined {
  if (!a || !b) return a ?? b;
  return {
    tokensIn: a.tokensIn + b.tokensIn,
    tokensOut: a.tokensOut + b.tokensOut,
    costUsd: a.costUsd + b.costUsd,
    deadline: a.deadline || b.deadline,
    estimated: a.estimated || b.estimated,
    unpriced: a.unpriced || b.unpriced,
  };
}

function mergeFailedUsage<T>(res: StructuredResult<T>, f: FailedCallUsage): StructuredResult<T> {
  const costSource =
    res.costSource === 'estimate' || f.estimated || f.unpriced ? ('estimate' as const) : res.costSource;
  return {
    ...res,
    tokensIn: res.tokensIn + f.tokensIn,
    tokensOut: res.tokensOut + f.tokensOut,
    costUsd: res.costUsd == null ? null : res.costUsd + f.costUsd,
    ...(costSource ? { costSource } : {}),
  };
}

const minutes = (ms: number): string => String(Math.round((ms / 60_000) * 10) / 10);

/**
 * One structured LLM call bounded by a deadline, with a heartbeat and at most
 * one retry (deadline, transient error or truncated output). Cancel and invalid
 * output never retry. `onFinalFailure` reports the failed attempts' usage when the call ends in a throw.
 * A first-attempt success returns the provider's result unchanged; a successful
 * retry returns a merged copy that also counts the failed attempt's usage
 * (reported rounds plus, on a deadline, an `estimate` for the aborted round).
 */
export async function callWithDeadline<T>(o: CallWithDeadlineOptions<T>): Promise<StructuredResult<T>> {
  const model = o.request.model;

  let failed: FailedCallUsage | undefined;
  const takeFailed = (): FailedCallUsage | undefined => {
    const f = failed;
    failed = undefined;
    return f;
  };

  const attempt = async (
    request: Omit<StructuredRequest<T>, 'signal' | 'onUsage'>,
  ): Promise<StructuredResult<T>> => {
    const reports: LlmUsageReport[] = [];
    const ctl = new AbortController();
    let deadlineHit = false;
    const started = Date.now();
    let lastReportAt = started;
    const timer =
      o.deadlineMs != null
        ? setTimeout(() => {
            deadlineHit = true;
            ctl.abort();
          }, o.deadlineMs)
        : undefined;
    const beat = setInterval(() => {
      const dl = o.deadlineMs != null ? `${minutes(o.deadlineMs)} min` : 'none';
      o.emit(
        'info',
        `${o.label}: still waiting for ${model} — ${minutes(Date.now() - started)} min elapsed (deadline ${dl})`,
      );
    }, LLM_WAIT_HEARTBEAT_MS);
    const signal = o.signal ? AbortSignal.any([o.signal, ctl.signal]) : ctl.signal;
    try {
      return await o.llm.completeStructured<T>({
        ...request,
        signal,
        onUsage: (u) => {
          reports.push(u);
          lastReportAt = Date.now();
        },
      });
    } catch (err) {
      if (o.signal?.aborted) {
        o.checkCancelled?.();
        throw o.signal.reason ?? err;
      }
      failed = collectFailed(request, reports, deadlineHit, lastReportAt);
      if (deadlineHit) {
        o.emit(
          'error',
          `${o.label}: no answer from ${model} within ${minutes(o.deadlineMs ?? 0)} min — aborted`,
        );
        throw new LlmDeadlineError(model, o.deadlineMs ?? 0);
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
      clearInterval(beat);
    }
  };

  const collectFailed = (
    request: Omit<StructuredRequest<T>, 'signal' | 'onUsage'>,
    reports: LlmUsageReport[],
    deadline: boolean,
    lastReportAt: number,
  ): FailedCallUsage | undefined => {
    const f: FailedCallUsage = { tokensIn: 0, tokensOut: 0, costUsd: 0, deadline, estimated: false, unpriced: false };
    for (const r of reports) {
      f.tokensIn += r.tokensIn;
      f.tokensOut += r.tokensOut;
      if (r.costUsd == null) f.unpriced = true;
      else f.costUsd += r.costUsd;
      if (r.costSource === 'estimate') f.estimated = true;
    }
    if (deadline) {
      const last = reports[reports.length - 1];
      const text = request.messages.map((m) => m.content).join('\n');
      const estIn = last ? last.tokensIn + last.tokensOut : (o.countTokens?.(text) ?? Math.ceil(text.length / 4));
      const estOut = Math.min(
        Math.round(((Date.now() - lastReportAt) / 1000) * DEADLINE_ESTIMATE_TOKENS_PER_SEC),
        request.maxTokens ?? Infinity,
      );
      const cost = o.estimateCost?.(model, estIn, estOut) ?? null;
      f.tokensIn += estIn;
      f.tokensOut += estOut;
      f.estimated = true;
      if (cost == null) f.unpriced = true;
      else f.costUsd += cost;
    }
    return reports.length > 0 || deadline ? f : undefined;
  };

  try {
    return await attempt(o.request);
  } catch (err) {
    const retryable =
      err instanceof LlmDeadlineError || err instanceof LlmOutputTruncatedError || isTransientLlmError(err);
    if (!retryable) {
      const f = takeFailed();
      if (f && !o.signal?.aborted) o.onFinalFailure?.(f);
      throw err;
    }
    const first = takeFailed();
    const retryReq: Omit<StructuredRequest<T>, 'signal' | 'onUsage'> = {
      ...o.request,
      ...(o.retryRouting ? { routing: o.retryRouting } : {}),
    };
    const name = err instanceof Error ? err.name : 'Error';
    o.emit(
      'info',
      `${o.label}: retrying once (${name}) · routing ${describeRouting(retryReq.routing, retryReq.requireParameters)}`,
    );
    let res: StructuredResult<T>;
    try {
      res = await attempt(retryReq);
    } catch (retryErr) {
      const total = sumFailed(first, takeFailed());
      if (total && !o.signal?.aborted) o.onFinalFailure?.(total);
      throw retryErr;
    }
    const f = first;
    if (!f) return res;
    o.emit(
      'info',
      `${o.label}: counted failed attempt — ${f.tokensIn} in / ${f.tokensOut} out tokens${f.deadline ? ' (deadline estimate)' : ''}${f.unpriced ? ' · one attempt could not be priced, cost excludes it' : ''}`,
    );
    return mergeFailedUsage(res, f);
  }
}
