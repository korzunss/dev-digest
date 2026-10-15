import { describe, it, expect } from 'vitest';
import {
  AgentManifest,
  CiRunStatus,
  CiRefreshInput,
  CiPreviewInput,
  CiInstallInput,
  CiResultArtifact,
} from '@devdigest/shared';

const manifest = {
  schema_version: 1,
  agent_version: 3,
  name: 'Reviewer',
  model: 'openai/gpt-4o',
  system_prompt: 'review',
};

describe('Export-to-CI contracts', () => {
  it('AgentManifest requires the v1 version fields and fills defaults', () => {
    const m = AgentManifest.parse({ ...manifest, skills: null });
    expect(m.skills).toEqual([]);
    expect(m.provider).toBe('openrouter');
    expect(m.ci_fail_on).toBe('critical');
    expect(AgentManifest.safeParse({ ...manifest, schema_version: 2 }).success).toBe(false);
    const { agent_version: _v, ...noVersion } = manifest;
    expect(AgentManifest.safeParse(noVersion).success).toBe(false);
  });

  it('CiRunStatus is the closed passed / gate_failed / error set', () => {
    expect(CiRunStatus.options).toEqual(['passed', 'gate_failed', 'error']);
    expect(CiRunStatus.safeParse('running').success).toBe(false);
  });

  it('CiRefreshInput is object-only', () => {
    expect(CiRefreshInput.safeParse({ agent_id: null }).success).toBe(true);
    expect(CiRefreshInput.safeParse(null).success).toBe(false);
    expect(CiRefreshInput.safeParse(undefined).success).toBe(false);
    expect(CiRefreshInput.safeParse({ agent_id: 'not-a-uuid' }).success).toBe(false);
  });

  it('install input extends preview with a mode and a capped workflow', () => {
    const base = {
      repo_id: '11111111-1111-4111-8111-111111111111',
      triggers: ['opened'],
      post_as: 'github_review',
    };
    expect(CiPreviewInput.safeParse(base).success).toBe(true);
    expect(CiPreviewInput.safeParse({ ...base, triggers: [] }).success).toBe(false);
    expect(CiInstallInput.safeParse({ ...base, mode: 'zip' }).success).toBe(true);
    expect(CiInstallInput.safeParse({ ...base, mode: 'push' }).success).toBe(false);
    expect(
      CiInstallInput.safeParse({ ...base, mode: 'zip', workflow: 'x'.repeat(65_537) }).success,
    ).toBe(false);
  });

  it('CiResultArtifact is strict and demands a 40-hex commit sha', () => {
    const a = {
      schema_version: 1,
      status: 'passed',
      verdict: 'comment',
      gate_tripped: false,
      findings_count: 0,
      critical: 0,
      warning: 0,
      suggestion: 0,
      cost_usd: null,
      duration_ms: 10,
      tokens_in: 1,
      tokens_out: 1,
      manifest_schema_version: 1,
      agent_name: 'a',
      agent_version: 1,
      model: 'm',
      runner_version: '0.1.0',
      deps: {},
      node_version: '22.0.0',
      commit_sha: 'a'.repeat(40),
      run_id: 1,
      run_attempt: 1,
      error_class: null,
    };
    expect(CiResultArtifact.safeParse(a).success).toBe(true);
    expect(CiResultArtifact.safeParse({ ...a, extra: 1 }).success).toBe(false);
    expect(CiResultArtifact.safeParse({ ...a, commit_sha: 'abc' }).success).toBe(false);
  });
});
