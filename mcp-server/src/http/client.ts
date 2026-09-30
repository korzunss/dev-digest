import type { ApiErrorBody } from '@devdigest/shared';
import { ApiError } from '../core/errors.js';
import type { DevDigestApi } from '../core/ports.js';

const TIMEOUT_MS = 10_000;
const MESSAGE_MAX = 200;

/** Structural guard: the API's `{error:{code,message}}` envelope. Bodies are typed, not runtime-parsed. */
function isApiErrorBody(v: unknown): v is ApiErrorBody {
  if (typeof v !== 'object' || v === null) return false;
  const e = (v as { error?: unknown }).error;
  if (typeof e !== 'object' || e === null) return false;
  const { code, message } = e as { code?: unknown; message?: unknown };
  return typeof code === 'string' && typeof message === 'string';
}

/** HTTP adapter for `DevDigestApi`. `baseUrl` is a parameter; `fetchImpl` is injectable for tests. */
export function createHttpApi(baseUrl: string, fetchImpl: typeof fetch = fetch): DevDigestApi {
  const base = baseUrl.replace(/\/+$/, '');
  const id = encodeURIComponent;

  async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        ...(body !== undefined
          ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
          : {}),
      });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new ApiError(0, 'timeout');
      throw new ApiError(0, 'unreachable');
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') throw new ApiError(0, 'timeout');
      json = undefined;
    }
    if (!res.ok) {
      if (isApiErrorBody(json)) {
        throw new ApiError(res.status, json.error.code, json.error.message.slice(0, MESSAGE_MAX));
      }
      throw new ApiError(res.status, res.status === 404 ? 'not_found' : 'http_error');
    }
    if (json === undefined) throw new ApiError(res.status, 'bad_response');
    return json as T;
  }

  return {
    listRepos: () => request('GET', '/repos'),
    listPulls: (repoId) => request('GET', `/repos/${id(repoId)}/pulls`),
    listAgents: () => request('GET', '/agents'),
    triggerReview: (pullId, agentId) => request('POST', `/pulls/${id(pullId)}/review`, { agentId }),
    listRuns: (pullId) => request('GET', `/pulls/${id(pullId)}/runs`),
    listReviews: (pullId) => request('GET', `/pulls/${id(pullId)}/reviews`),
    getConventions: (repoId) => request('GET', `/repos/${id(repoId)}/conventions`),
  };
}
