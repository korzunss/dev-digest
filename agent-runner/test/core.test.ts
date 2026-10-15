import { describe, expect, it } from 'vitest';
import type { Finding, Review } from '@devdigest/shared';
import { CiResultArtifact } from '@devdigest/shared';
import { parseUnifiedDiff } from '@devdigest/reviewer-core';
import { buildResult, exitCode, loadManifest, parseEvent, postPlan, shouldSkip, type ResultInput } from '../src/core.js';

const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);

const eventJson = (over: { headRepo?: string | null; baseSha?: string } = {}) =>
  JSON.stringify({
    pull_request: {
      number: 7,
      base: { sha: over.baseSha ?? BASE, repo: { full_name: 'acme/app' } },
      head: { sha: HEAD, repo: over.headRepo === null ? null : { full_name: over.headRepo ?? 'acme/app' } },
    },
  });

const finding = (severity: Finding['severity']): Finding => ({
  id: severity,
  severity,
  category: 'bug',
  title: 't',
  file: 'a.ts',
  start_line: 1,
  end_line: 1,
  rationale: 'r',
  confidence: 0.9,
}) as Finding;

const review = (...sev: Finding['severity'][]): Review => ({
  verdict: sev.length ? 'comment' : 'approve',
  summary: 's',
  score: 80,
  findings: sev.map(finding),
});

const input = (r: Review | null, failOn: ResultInput['failOn'], errorClass: string | null = null): ResultInput => ({
  review: r,
  failOn,
  errorClass,
  costUsd: 0.01,
  durationMs: 1200,
  tokensIn: 10,
  tokensOut: 5,
  manifest: { schemaVersion: 1, agentName: 'A', agentVersion: 2, model: 'm/x' },
  runnerVersion: '0.1.0',
  deps: { zod: '3.25.76' },
  nodeVersion: 'v22.0.0',
  commitSha: HEAD,
  runId: 99,
  runAttempt: 1,
});

describe('parseEvent / shouldSkip', () => {
  it('parses the fields it needs', () => {
    expect(parseEvent(eventJson())).toMatchObject({ number: 7, baseSha: BASE, headSha: HEAD, headRepo: 'acme/app' });
  });
  it('rejects a non-hex SHA, naming the field', () => {
    expect(() => parseEvent(eventJson({ baseSha: '--upload-pack=x' }))).toThrow(/pull_request\.base\.sha/);
  });
  it('skips a fork and a deleted fork', () => {
    expect(shouldSkip({ event: parseEvent(eventJson({ headRepo: 'evil/app' })), apiKey: 'k' })).toMatch(/fork/);
    expect(shouldSkip({ event: parseEvent(eventJson({ headRepo: null })), apiKey: 'k' })).toMatch(/fork/);
  });
  it('skips without a key, runs with one', () => {
    const event = parseEvent(eventJson());
    expect(shouldSkip({ event, apiKey: undefined })).toMatch(/OPENROUTER_API_KEY/);
    expect(shouldSkip({ event, apiKey: 'k' })).toBeNull();
  });
});

describe('loadManifest', () => {
  const ok = 'schema_version: 1\nagent_version: 2\nname: A\nmodel: m/x\nsystem_prompt: hi\nci_fail_on: warning\n';
  it('parses a valid manifest', () => {
    expect(loadManifest(ok)).toMatchObject({ name: 'A', ci_fail_on: 'warning', skills: [] });
  });
  it('names the invalid field', () => {
    expect(() => loadManifest(ok.replace('model: m/x', 'model: ""'))).toThrow(/manifest invalid at model/);
    expect(() => loadManifest('name: A')).toThrow(/schema_version/);
  });
});

describe('buildResult / exitCode', () => {
  it.each([
    ['never', ['CRITICAL'], 'passed', 0],
    ['critical', ['WARNING'], 'passed', 0],
    ['critical', ['CRITICAL'], 'gate_failed', 1],
    ['warning', ['WARNING'], 'gate_failed', 1],
    ['any', ['SUGGESTION'], 'gate_failed', 1],
    ['any', [], 'passed', 0],
  ] as const)('ci_fail_on=%s with %j -> %s', (failOn, sev, status, code) => {
    const r = buildResult(input(review(...sev), failOn));
    expect(r.status).toBe(status);
    expect(exitCode(r)).toBe(code);
    expect(CiResultArtifact.safeParse(r).success).toBe(true);
  });
  it('counts per severity', () => {
    const r = buildResult(input(review('CRITICAL', 'WARNING', 'WARNING'), 'never'));
    expect(r).toMatchObject({ findings_count: 3, critical: 1, warning: 2, suggestion: 0 });
  });
  it('builds an error result with no verdict and exits 1', () => {
    const r = buildResult(input(null, 'critical', 'LlmDeadlineError'));
    expect(r).toMatchObject({ status: 'error', verdict: null, error_class: 'LlmDeadlineError', findings_count: 0 });
    expect(exitCode(r)).toBe(1);
  });
});

describe('postPlan', () => {
  const diff = parseUnifiedDiff('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -0,0 +1,2 @@\n+x\n+y\n');
  const opts = { failOn: 'critical' as const, diff };
  it('github_review posts a review payload with the deterministic event', () => {
    const p = postPlan('github_review', review('CRITICAL'), opts);
    expect(p.kind).toBe('review');
    if (p.kind === 'review') expect(p.payload.event).toBe('REQUEST_CHANGES');
  });
  it('pr_comment posts a body', () => {
    const p = postPlan('pr_comment', review('WARNING'), opts);
    expect(p.kind).toBe('comment');
    if (p.kind === 'comment') expect(p.body.length).toBeGreaterThan(0);
  });
  it('none posts nothing', () => {
    expect(postPlan('none', review('CRITICAL'), opts)).toEqual({ kind: 'none' });
  });
});
