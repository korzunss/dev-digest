import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { parseResultArtifact, toStatus, nextCursor } from '../src/modules/ci/artifact.js';

const SHA = 'a'.repeat(40);
const run = { id: 77, run_attempt: 2, head_sha: SHA };
const artifact = {
  schema_version: 1, status: 'passed', verdict: 'comment', gate_tripped: false,
  findings_count: 1, critical: 0, warning: 1, suggestion: 0, cost_usd: 0.01,
  duration_ms: 1000, tokens_in: 10, tokens_out: 5, manifest_schema_version: 1,
  agent_name: 'A', agent_version: 1, model: 'm', runner_version: '0.1.0', deps: {},
  node_version: 'v22', commit_sha: SHA, run_id: 77, run_attempt: 2, error_class: null,
};
const zip = (o: unknown, name = 'devdigest-result.json') =>
  zipSync({ [name]: strToU8(typeof o === 'string' ? o : JSON.stringify(o)) });

describe('parseResultArtifact', () => {
  it('accepts a valid artifact', () => {
    const r = parseResultArtifact(zip(artifact), run);
    expect(r.ok && r.value.findings_count).toBe(1);
  });
  it('rejects an oversized zip before unzipping', () => {
    expect(parseResultArtifact(new Uint8Array(1_048_577), run)).toEqual({ ok: false, reason: 'zip_too_large' });
  });
  it('refuses a zip bomb by declared size', () => {
    const big = zipSync({ 'devdigest-result.json': new Uint8Array(300_000) });
    expect(big.byteLength).toBeLessThan(10_000);
    expect(parseResultArtifact(big, run)).toMatchObject({ ok: false, reason: 'json_too_large' });
  });
  it('rejects garbage, missing file, bad json, bad schema', () => {
    expect(parseResultArtifact(new Uint8Array([1, 2, 3]), run)).toMatchObject({ reason: 'zip_invalid' });
    expect(parseResultArtifact(zip(artifact, 'other.json'), run)).toMatchObject({ reason: 'json_missing' });
    expect(parseResultArtifact(zip('{nope'), run)).toMatchObject({ reason: 'json_invalid' });
    expect(parseResultArtifact(zip({ ...artifact, extra: 1 }), run)).toMatchObject({ reason: 'schema_invalid' });
    expect(parseResultArtifact(zip({ ...artifact, findings_count: -1 }), run)).toMatchObject({
      reason: 'schema_invalid', detail: 'findings_count',
    });
  });
  it('rejects sha and attempt mismatches', () => {
    expect(parseResultArtifact(zip({ ...artifact, commit_sha: 'b'.repeat(40) }), run)).toMatchObject({ reason: 'sha_mismatch' });
    expect(parseResultArtifact(zip({ ...artifact, run_attempt: 1 }), run)).toMatchObject({ reason: 'attempt_mismatch' });
    expect(parseResultArtifact(zip({ ...artifact, run_id: 1 }), run)).toMatchObject({ reason: 'attempt_mismatch' });
  });
});

describe('toStatus', () => {
  const a = artifact as never;
  it('maps', () => {
    expect(toStatus({ ...(a as object), status: 'error' } as never)).toBe('error');
    expect(toStatus({ ...(a as object), gate_tripped: true } as never)).toBe('gate_failed');
    expect(toStatus(a)).toBe('passed');
  });
});

describe('nextCursor', () => {
  const r = (updated_at: string) => ({ updated_at });
  it('is the newest updated_at among the handled runs', () => {
    expect(nextCursor([r('2026-01-01T00:00:00Z'), r('2026-01-03T00:00:00Z'), r('2026-01-02T00:00:00Z')], null)).toBe('2026-01-03T00:00:00.000Z');
  });
  it('moves forward for a re-run: same created_at, newer updated_at', () => {
    expect(nextCursor([r('2026-01-05T00:00:00Z')], '2026-01-03T00:00:00.000Z')).toBe('2026-01-05T00:00:00.000Z');
  });
  it('keeps the old cursor when nothing was handled or it would go back', () => {
    expect(nextCursor([], 'x')).toBe('x');
    expect(nextCursor([r('2026-01-01T00:00:00Z')], '2026-02-01T00:00:00Z')).toBe('2026-02-01T00:00:00Z');
  });
});
