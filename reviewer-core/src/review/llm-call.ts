import type {
  LLMProvider,
  LlmRouting,
  RunEventKind,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { LlmDeadlineError, isTransientLlmError } from '../llm/errors.js';

/** How often an in-flight call logs "still waiting" (assumption: 2 min). */
export const LLM_WAIT_HEARTBEAT_MS = 120_000;

/** Human-readable routing summary for run-log lines. */
export function describeRouting(r?: LlmRouting, requireParameters?: boolean): string {
  const parts: string[] = [];
  if (r?.sort) parts.push(`sort=${r.sort}`);
  if (requireParameters) parts.push('require_parameters');
  return parts.length ? parts.join(' · ') : 'default';
}

export interface CallWithDeadlineOptions<T> {
  llm: LLMProvider;
  request: Omit<StructuredRequest<T>, 'signal'>;
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
}

const minutes = (ms: number): string => String(Math.round((ms / 60_000) * 10) / 10);

/**
 * One structured LLM call bounded by a deadline, with a heartbeat and at most
 * one retry (deadline or transient error). Cancel/truncated/invalid never retry.
 */
export async function callWithDeadline<T>(o: CallWithDeadlineOptions<T>): Promise<StructuredResult<T>> {
  const model = o.request.model;

  const attempt = async (request: Omit<StructuredRequest<T>, 'signal'>): Promise<StructuredResult<T>> => {
    const ctl = new AbortController();
    let deadlineHit = false;
    const started = Date.now();
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
      return await o.llm.completeStructured<T>({ ...request, signal });
    } catch (err) {
      if (o.signal?.aborted) {
        o.checkCancelled?.();
        throw o.signal.reason ?? err;
      }
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

  try {
    return await attempt(o.request);
  } catch (err) {
    if (!(err instanceof LlmDeadlineError) && !isTransientLlmError(err)) throw err;
    const retryReq: Omit<StructuredRequest<T>, 'signal'> = {
      ...o.request,
      ...(o.retryRouting ? { routing: o.retryRouting } : {}),
    };
    const name = err instanceof Error ? err.name : 'Error';
    o.emit(
      'info',
      `${o.label}: retrying once (${name}) · routing ${describeRouting(retryReq.routing, retryReq.requireParameters)}`,
    );
    return attempt(retryReq);
  }
}
