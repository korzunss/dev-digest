import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import {
  reviewPullRequest,
  parseUnifiedDiff,
  type PathMatcher,
  type ScopedSkillInput,
} from '../src/index.js';

const empty = { verdict: 'approve', summary: 's', score: 100, findings: [] };
const finding = (file: string, line: number) => ({
  severity: 'WARNING',
  category: 'bug',
  title: `issue in ${file}`,
  file,
  start_line: line,
  end_line: line,
  explanation: 'x',
  confidence: 0.9,
});

function fileDiff(path: string, extra = ''): string {
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,1 +1,2 @@\n a\n+b ${extra}`;
}
const diffOf = (paths: string[], deleted: string[] = []) =>
  parseUnifiedDiff(
    [
      ...paths.map((p) => fileDiff(p)),
      ...deleted.map((p) => `diff --git a/${p} b/${p}\n--- a/${p}\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-bye`),
    ].join('\n'),
  );

const user = (req: StructuredRequest<unknown>) => req.messages[req.messages.length - 1]!.content;
const allText = (req: StructuredRequest<unknown>) => req.messages.map((m) => m.content).join('\n');

/** `reply(content)` decides per call; default is an empty approve review. */
function fake(reply?: (req: StructuredRequest<unknown>) => unknown) {
  const reqs: StructuredRequest<unknown>[] = [];
  const llm = {
    id: 'openrouter',
    completeStructured: async (req: StructuredRequest<unknown>) => {
      reqs.push(req);
      const data = reply ? reply(req) : empty;
      return { data, model: req.model, tokensIn: 1, tokensOut: 1, costUsd: null, raw: '{}', attempts: 1 } as StructuredResult<unknown>;
    },
  } as unknown as LLMProvider;
  return { llm, reqs };
}

const skill = (id: string, paths: string[]): ScopedSkillInput => ({ id, name: id, version: 1, body: `BODY-${id}`, paths });
const match: PathMatcher = (path, globs) => globs.some((g) => path.endsWith(g.replace('**/*', '')));
const base = { systemPrompt: 'sys', model: 'm', matchesPath: match };

describe('single-pass grouping by skill set', () => {
  it('one group sends the same messages as a run without scopedSkills', async () => {
    const diff = diffOf(['a.ts', 'b.ts']);
    const a = fake();
    const b = fake();
    await reviewPullRequest({ ...base, llm: a.llm, diff, skills: ['BODY-all', 'BODY-ts'] });
    const out = await reviewPullRequest({
      ...base,
      llm: b.llm,
      diff,
      scopedSkills: [skill('all', []), skill('ts', ['**/*.ts'])],
    });
    expect(b.reqs).toHaveLength(1);
    expect(b.reqs[0]!.messages).toEqual(a.reqs[0]!.messages);
    expect(out.chunks).toEqual([{ label: 'all files' }]);
    expect(out.calls).toEqual([{ label: 'all files', paths: ['a.ts', 'b.ts'], skillIds: ['all', 'ts'], ok: true }]);
  });

  it('.cs + .tsx make two calls with their own skills and diff, and the full file list in both', async () => {
    const { llm, reqs } = fake();
    const msgs: string[] = [];
    const out = await reviewPullRequest({
      ...base,
      llm,
      diff: diffOf(['x.cs', 'y.tsx']),
      changedFiles: ['x.cs', 'y.tsx'],
      scopedSkills: [skill('all', []), skill('cs', ['**/*.cs']), skill('ts', ['**/*.tsx'])],
      onEvent: (e) => msgs.push(e.msg),
    });
    expect(reqs).toHaveLength(2);
    expect(allText(reqs[0]!)).toContain('BODY-cs');
    expect(allText(reqs[0]!)).not.toContain('BODY-ts');
    expect(allText(reqs[0]!)).toContain('x.cs');
    expect(user(reqs[0]!)).not.toContain('y.tsx\n@@');
    expect(allText(reqs[1]!)).toContain('BODY-ts');
    expect(allText(reqs[1]!)).not.toContain('BODY-cs');
    for (const r of reqs) {
      expect(allText(r)).toContain('BODY-all');
      expect(allText(r)).toContain('x.cs');
      expect(allText(r)).toContain('y.tsx');
    }
    expect(out.calls.map((c) => c.label)).toEqual(['group 1', 'group 2']);
    expect(out.calls.map((c) => c.skillIds)).toEqual([['all', 'cs'], ['all', 'ts']]);
    expect(msgs).toContain('Grouped 2 files into 2 review calls by skill set: group 1: 1 files · all, cs; group 2: 1 files · all, ts');
    expect(out.review.summary).toContain('Reviewed 2 files in 2 chunks');
  });

  it('applies repo rules per group', async () => {
    const { llm, reqs } = fake();
    await reviewPullRequest({
      ...base,
      llm,
      diff: diffOf(['svc/a.cs', 'web/b.tsx']),
      scopedSkills: [skill('cs', ['**/*.cs']), skill('ts', ['**/*.tsx'])],
      repoRules: [
        { scope: 'svc', source: 'svc/AGENTS.md', text: 'SVC-RULE' },
        { scope: 'web', source: 'web/AGENTS.md', text: 'WEB-RULE' },
      ] as never,
    });
    expect(allText(reqs[0]!)).toContain('SVC-RULE');
    expect(allText(reqs[0]!)).not.toContain('WEB-RULE');
    expect(allText(reqs[1]!)).toContain('WEB-RULE');
    expect(allText(reqs[1]!)).not.toContain('SVC-RULE');
  });

  it('logs a group with no matching skill and sends no skills section', async () => {
    const { llm, reqs } = fake();
    const msgs: string[] = [];
    await reviewPullRequest({
      ...base,
      llm,
      diff: diffOf(['a.cs', 'b.md']),
      scopedSkills: [skill('cs', ['**/*.cs'])],
      onEvent: (e) => msgs.push(e.msg),
    });
    expect(reqs).toHaveLength(2);
    expect(allText(reqs[1]!)).not.toContain('## Skills');
    expect(msgs).toContain('group 2: no skill matches its files — reviewed with no skills section');
  });

  it('a deleted file is routed by its old path and a deleted-only group makes no call', async () => {
    const { llm, reqs } = fake();
    const out = await reviewPullRequest({
      ...base,
      llm,
      diff: diffOf(['a.ts'], ['old/Gone.cs']),
      scopedSkills: [skill('ts', ['**/*.ts']), skill('cs', ['**/*.cs'])],
    });
    expect(reqs).toHaveLength(1);
    expect(out.chunks).toEqual([{ label: 'all files' }]);
    expect(allText(reqs[0]!)).toContain('BODY-ts');
    expect(allText(reqs[0]!)).not.toContain('BODY-cs');
  });

  it('a group over the single-pass limit goes per file, the other group stays one call', async () => {
    const { llm, reqs } = fake();
    const out = await reviewPullRequest({
      ...base,
      llm,
      diff: diffOf(['a.cs', 'b.cs', 'c.ts']),
      scopedSkills: [skill('cs', ['**/*.cs']), skill('ts', ['**/*.ts'])],
      // A custom counter that sizes only the .cs group's text as huge (the whole diff is not).
      singlePassMaxDiffTokens: 1_000_000,
      countTokens: (s) => (s.includes('a.cs') && s.includes('b.cs') && !s.includes('c.ts') ? 2_000_000 : 10),
      strategy: 'single-pass',
    });
    expect(out.mode).toBe('single-pass');
    expect(out.calls.map((c) => c.label)).toEqual(['a.cs', 'b.cs', 'group 2']);
    expect(reqs).toHaveLength(3);
  });

  it('drops a finding citing the other group\'s file when grounding per group', async () => {
    const { llm } = fake((req) => {
      const t = user(req);
      // Both calls claim a finding on y.tsx line 2; only the group that holds y.tsx may keep it.
      return { ...empty, findings: [finding('y.tsx', 2)], verdict: 'comment', summary: t.includes('x.cs') ? 'cs' : 'ts' };
    });
    const out = await reviewPullRequest({
      ...base,
      llm,
      diff: diffOf(['x.cs', 'y.tsx']),
      scopedSkills: [skill('cs', ['**/*.cs']), skill('ts', ['**/*.tsx'])],
    });
    expect(out.review.findings).toHaveLength(1);
    expect(out.dropped).toHaveLength(1);
  });

  it('map-reduce gives each file its own skills and keeps whole-diff grounding', async () => {
    const { llm, reqs } = fake((req) => ({
      ...empty,
      findings: user(req).includes('a.cs') ? [finding('b.ts', 2)] : [],
    }));
    const out = await reviewPullRequest({
      ...base,
      llm,
      diff: diffOf(['a.cs', 'b.ts']),
      strategy: 'map-reduce',
      scopedSkills: [skill('cs', ['**/*.cs']), skill('ts', ['**/*.ts'])],
    });
    expect(out.mode).toBe('map-reduce');
    expect(allText(reqs[0]!)).toContain('BODY-cs');
    expect(allText(reqs[0]!)).not.toContain('BODY-ts');
    expect(allText(reqs[1]!)).toContain('BODY-ts');
    // chunk finding citing another changed file's diff line is kept, as today
    expect(out.review.findings).toHaveLength(1);
    expect(out.calls.map((c) => c.skillIds)).toEqual([['cs'], ['ts']]);
  });

  it('map-reduce without scopedSkills keeps a chunk finding citing another changed file', async () => {
    const { llm, reqs } = fake((req) => ({
      ...empty,
      findings: user(req).includes('a.cs') ? [finding('b.ts', 2)] : [],
    }));
    const out = await reviewPullRequest({
      ...base,
      llm,
      diff: diffOf(['a.cs', 'b.ts']),
      strategy: 'map-reduce',
    });
    expect(out.mode).toBe('map-reduce');
    expect(reqs.length).toBeGreaterThan(1);
    expect(out.review.findings).toHaveLength(1);
  });

  it('drops a doc inherited only via a skill that is not in the call', async () => {
    const { llm, reqs } = fake();
    await reviewPullRequest({
      ...base,
      llm,
      diff: diffOf(['a.cs', 'b.ts']),
      scopedSkills: [skill('cs', ['**/*.cs']), skill('ts', ['**/*.ts'])],
      specs: [
        { path: 'own.md', body: 'OWN-DOC' },
        { path: 'cs.md', body: 'CS-DOC', viaSkillIds: ['cs'] },
      ],
    });
    expect(allText(reqs[0]!)).toContain('CS-DOC');
    expect(allText(reqs[1]!)).not.toContain('CS-DOC');
    expect(allText(reqs[1]!)).toContain('OWN-DOC');
  });

  it('treats every skill as unscoped without matchesPath', async () => {
    const { llm, reqs } = fake();
    await reviewPullRequest({
      systemPrompt: 'sys',
      model: 'm',
      llm,
      diff: diffOf(['a.cs', 'b.ts']),
      scopedSkills: [skill('cs', ['**/*.cs'])],
    });
    expect(reqs).toHaveLength(1);
    expect(allText(reqs[0]!)).toContain('BODY-cs');
  });
});
