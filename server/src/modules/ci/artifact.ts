import { unzipSync, strFromU8 } from 'fflate';
import { CiResultArtifact } from '@devdigest/shared';
import type { CiRunStatus, WorkflowRunMeta } from '@devdigest/shared';
import { ARTIFACT_FILE, MAX_JSON_BYTES, MAX_ZIP_BYTES } from './constants.js';

/** Pure helpers for ingesting a CI run's `devdigest-result` artifact. */

export type ArtifactRejection =
  | 'zip_too_large'
  | 'zip_invalid'
  | 'json_missing'
  | 'json_too_large'
  | 'json_invalid'
  | 'schema_invalid'
  | 'sha_mismatch'
  | 'attempt_mismatch';

export type ParseArtifactResult =
  | { ok: true; value: CiResultArtifact }
  | { ok: false; reason: ArtifactRejection; detail?: string };

export function parseResultArtifact(
  zipBytes: Uint8Array,
  run: Pick<WorkflowRunMeta, 'id' | 'run_attempt' | 'head_sha'>,
): ParseArtifactResult {
  if (zipBytes.byteLength > MAX_ZIP_BYTES) return { ok: false, reason: 'zip_too_large' };

  let oversized = false;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zipBytes, {
      filter: (f) => {
        if (f.name !== ARTIFACT_FILE) return false;
        if (f.originalSize > MAX_JSON_BYTES) {
          oversized = true;
          return false;
        }
        return true;
      },
    });
  } catch {
    return { ok: false, reason: 'zip_invalid' };
  }
  if (oversized) return { ok: false, reason: 'json_too_large' };
  const raw = files[ARTIFACT_FILE];
  if (!raw) return { ok: false, reason: 'json_missing' };
  // The header's size is only a claim; check what was actually inflated.
  if (raw.byteLength > MAX_JSON_BYTES) return { ok: false, reason: 'json_too_large' };

  let json: unknown;
  try {
    json = JSON.parse(strFromU8(raw));
  } catch {
    return { ok: false, reason: 'json_invalid' };
  }
  const parsed = CiResultArtifact.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, reason: 'schema_invalid', detail: issue?.path.join('.') || undefined };
  }
  const a = parsed.data;
  if (a.commit_sha !== run.head_sha) return { ok: false, reason: 'sha_mismatch' };
  if (a.run_id !== run.id || a.run_attempt !== run.run_attempt) {
    return { ok: false, reason: 'attempt_mismatch' };
  }
  return { ok: true, value: a };
}

export function toStatus(a: CiResultArtifact): CiRunStatus {
  if (a.status === 'error') return 'error';
  return a.gate_tripped ? 'gate_failed' : 'passed';
}

/**
 * The next scan cursor (DN4): the newest `updated_at` among the runs handled in
 * this pass. A run is handled when it is `completed` and its `updated_at` is
 * past the old cursor, so a completed run without an artifact is not looked at
 * again (AC-50), a re-run (same `created_at`, newer `updated_at`) is, and a run
 * still in progress is picked up once it completes (completion bumps its
 * `updated_at` past anything handled earlier). Never moves backwards.
 */
export function nextCursor(
  handled: Pick<WorkflowRunMeta, 'updated_at'>[],
  oldCursor: string | null,
): string | null {
  let max = oldCursor ? Date.parse(oldCursor) : Number.NEGATIVE_INFINITY;
  let moved = false;
  for (const r of handled) {
    const t = Date.parse(r.updated_at);
    if (!Number.isNaN(t) && t > max) {
      max = t;
      moved = true;
    }
  }
  return moved ? new Date(max).toISOString() : oldCursor;
}
