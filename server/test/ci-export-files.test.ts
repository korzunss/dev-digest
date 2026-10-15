import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import {
  buildExportFiles,
  prBody,
  uniqueSlugs,
  zipFiles,
  runnerVersionOf,
  type BuildExportInput,
} from '../src/modules/ci/export-files.js';
import { unzipSync, strFromU8 } from 'fflate';

const base: BuildExportInput = {
  agent: {
    name: 'Code Reviewer',
    provider: 'openrouter',
    model: 'openai/gpt-4o',
    systemPrompt: 'Review: carefully\n- be kind',
    strategy: 'auto',
    ciFailOn: 'warning',
  },
  version: 4,
  skills: [],
  memory: [],
  workflow: 'name: x\n',
  runnerJs: '// runner\n',
};

function build(over: Partial<BuildExportInput> = {}) {
  const r = buildExportFiles({ ...base, ...over });
  if (!r.ok) throw new Error('blocked');
  return r.files;
}

describe('buildExportFiles', () => {
  it('emits 4 files for no skills and 6 for two, in AC-11 order', () => {
    expect(build().map((f) => f.path)).toEqual([
      '.devdigest/agents/code-reviewer.yaml',
      '.devdigest/memory.jsonl',
      '.devdigest/runner/index.js',
      '.github/workflows/devdigest-review.yml',
    ]);
    const files = build({
      skills: [
        { name: 'A', body: 'a body' },
        { name: 'B', body: 'b body' },
      ],
    });
    expect(files).toHaveLength(6);
    expect(files[1]!.contents).toBe('a body');
    expect(files.filter((f) => f.editable).map((f) => f.path)).toEqual([
      '.github/workflows/devdigest-review.yml',
    ]);
  });

  it('makes colliding slugs unique', () => {
    expect(uniqueSlugs(['Sec Rules', 'sec rules', 'SEC-RULES!'])).toEqual([
      'sec-rules',
      'sec-rules-2',
      'sec-rules-3',
    ]);
    const paths = build({ skills: [{ name: 'X', body: '1' }, { name: 'x', body: '2' }] }).map((f) => f.path);
    expect(paths).toContain('.devdigest/skills/x-2.md');
  });

  it('writes memory as kind/content lines, empty when none', () => {
    expect(build()[1]!.contents).toBe('');
    const m = build({ memory: [{ kind: 'k', content: 'c\nd' }, { kind: 'g', content: 'h' }] })[1]!.contents;
    const lines = m.trimEnd().split('\n');
    expect(lines.map((l) => JSON.parse(l))).toEqual([
      { kind: 'k', content: 'c\nd' },
      { kind: 'g', content: 'h' },
    ]);
  });

  it('round-trips the manifest through yaml + AgentManifest', () => {
    const yaml = build({ skills: [{ name: 'Sec', body: 'b' }] })[0]!.contents;
    const m = AgentManifest.parse(parse(yaml));
    expect(m).toMatchObject({
      name: 'Code Reviewer',
      agent_version: 4,
      skills: ['sec'],
      ci_fail_on: 'warning',
      system_prompt: base.agent.systemPrompt,
    });
  });

  it('blocks with the failing field when the manifest is invalid', () => {
    const r = buildExportFiles({ ...base, agent: { ...base.agent, model: '' } });
    expect(r).toMatchObject({ ok: false, blocked: { code: 'manifest_invalid', field: 'model' } });
  });

  it('prBody lists the real file count and the checklist', () => {
    const files = build({ skills: [{ name: 'A', body: '' }] });
    const body = prBody(files, 'o/r');
    expect(body).toContain('creates 5 files');
    expect(body).toContain('CODEOWNERS');
    expect(body).toContain('OPENROUTER_API_KEY');
    for (const f of files) expect(body).toContain(f.path);
  });

  it('zips every file', () => {
    const files = build();
    const out = unzipSync(zipFiles(files));
    expect(Object.keys(out).sort()).toEqual(files.map((f) => f.path).sort());
    expect(strFromU8(out['.devdigest/runner/index.js']!)).toBe('// runner\n');
  });

  it('reads the runner version from the header', () => {
    expect(runnerVersionOf(`// devdigest-agent-runner v0.1.0 sha256:${'a'.repeat(64)}\nx`)).toBe('0.1.0');
    expect(runnerVersionOf('nope')).toBeNull();
  });
});
