import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LLMProvider } from '@devdigest/shared';
import { CiResultArtifact } from '@devdigest/shared';
import { run } from '../src/main.js';
import { nodeIo, type RunnerIo } from '../src/io.js';

const API_KEY = 'sk-or-SECRETKEY-123456';
const GH_TOKEN = 'ghs_SECRETTOKEN654321';

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { encoding: 'utf8' }).trim();

let root: string;
let baseSha: string;
let headSha: string;
let out: string[];
let err: string[];

const MANIFEST = `schema_version: 1
agent_version: 3
name: Sec reviewer
model: m/x
system_prompt: Be strict.
skills: [s1]
ci_fail_on: critical
`;

function setup() {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'devdigest-runner-')));
  // Guard (root INSIGHTS 2026-10-05): the repo under test must be this temp dir.
  git(root, 'init', '-q');
  if (realpathSync(git(root, 'rev-parse', '--show-toplevel')) !== root) throw new Error('not the temp repo');
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/config.ts'), 'export const a = 1;\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  baseSha = git(root, 'rev-parse', 'HEAD');
  writeFileSync(join(root, 'src/config.ts'), `export const a = 1;\nexport const key = '${API_KEY}';\n`);
  git(root, 'commit', '-q', '-am', 'head');
  headSha = git(root, 'rev-parse', 'HEAD');

  const cfg = join(root, '.cfg');
  mkdirSync(join(cfg, 'agents'), { recursive: true });
  mkdirSync(join(cfg, 'skills'));
  writeFileSync(join(cfg, 'agents/sec.yaml'), MANIFEST);
  writeFileSync(join(cfg, 'skills/s1.md'), 'Skill body');
  writeFileSync(join(cfg, 'memory.jsonl'), `${JSON.stringify({ kind: 'note', content: 'ctx' })}\n`);
  writeFileSync(
    join(root, 'event.json'),
    JSON.stringify({
      pull_request: {
        number: 5,
        base: { sha: baseSha, repo: { full_name: 'acme/app' } },
        head: { sha: headSha, repo: { full_name: 'acme/app' } },
      },
    }),
  );
}

const env = (over: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  GITHUB_EVENT_PATH: join(root, 'event.json'),
  GITHUB_API_URL: 'https://api.github.test',
  GITHUB_RUN_ID: '42',
  GITHUB_RUN_ATTEMPT: '2',
  OPENROUTER_API_KEY: API_KEY,
  GITHUB_TOKEN: GH_TOKEN,
  DEVDIGEST_CONFIG_DIR: join(root, '.cfg'),
  DEVDIGEST_WORKDIR: root,
  ...over,
});

let resultPath: string;
const testIo = (): RunnerIo => ({
  ...nodeIo,
  // The result goes to the temp dir, not the test's cwd.
  writeText: async (p, c) => nodeIo.writeText(p === 'devdigest-result.json' ? resultPath : p, c),
  stdout: (l) => out.push(l),
  stderr: (l) => err.push(l),
});

const finding = (severity: string) => ({
  id: 'f1',
  severity,
  category: 'security',
  title: 'Hardcoded key',
  file: 'src/config.ts',
  start_line: 2,
  end_line: 2,
  rationale: `leaks ${API_KEY}`,
  confidence: 0.9,
  kind: 'finding',
});

const llm = (data: unknown | Error): LLMProvider =>
  ({
    id: 'openrouter',
    completeStructured: async () => {
      if (data instanceof Error) throw data;
      return { data, model: 'm/x', tokensIn: 100, tokensOut: 20, costUsd: 0.002, raw: '{}', attempts: 1 };
    },
  }) as unknown as LLMProvider;

const okFetch = (calls: { url: string; init: RequestInit }[]): typeof fetch =>
  (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;

const readResult = () => JSON.parse(execFileSync('cat', [resultPath], { encoding: 'utf8' }));

beforeEach(() => {
  out = [];
  err = [];
  setup();
  resultPath = join(root, 'result.json');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('runner main', () => {
  it('reviews the SHA diff, posts a review, writes a valid result and exits 1 on a tripped gate', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const code = await run(env(), {
      io: testIo(),
      fetch: okFetch(calls),
      makeLlm: () => llm({ verdict: 'request_changes', summary: 's', score: 10, findings: [finding('CRITICAL')] }),
    });
    expect(code).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.github.test/repos/acme/app/pulls/5/reviews');
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ commit_id: headSha, event: 'REQUEST_CHANGES' });
    const result = CiResultArtifact.parse(readResult());
    expect(result).toMatchObject({ status: 'gate_failed', critical: 1, run_id: 42, run_attempt: 2, commit_sha: headSha, agent_version: 3 });
  });

  it('exits 0 when the gate does not trip, and posts nothing for post_as=none', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const code = await run(env({ DEVDIGEST_POST_AS: 'none' }), {
      io: testIo(),
      fetch: okFetch(calls),
      makeLlm: () => llm({ verdict: 'comment', summary: 's', score: 80, findings: [finding('WARNING')] }),
    });
    expect(code).toBe(0);
    expect(calls).toHaveLength(0);
    expect(readResult().status).toBe('passed');
  });

  it('skips a fork with exit 0, no result and no model call', async () => {
    writeFileSync(
      join(root, 'event.json'),
      JSON.stringify({
        pull_request: {
          number: 5,
          base: { sha: baseSha, repo: { full_name: 'acme/app' } },
          head: { sha: headSha, repo: { full_name: 'evil/app' } },
        },
      }),
    );
    const code = await run(env(), { io: testIo(), makeLlm: () => { throw new Error('must not be called'); } });
    expect(code).toBe(0);
    expect(out.join('\n')).toMatch(/fork/);
  });

  it('fails on an invalid manifest, naming the field, without a model call', async () => {
    writeFileSync(join(root, '.cfg/agents/sec.yaml'), MANIFEST.replace('model: m/x', 'model: ""'));
    const code = await run(env(), { io: testIo(), makeLlm: () => { throw new Error('must not be called'); } });
    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/model/);
  });

  it('writes an error result and exits 1 when the model call fails, posting nothing', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const boom = new Error(`upstream said ${API_KEY} is bad`);
    boom.name = 'LlmConnectionError';
    const code = await run(env(), { io: testIo(), fetch: okFetch(calls), makeLlm: () => llm(boom) });
    expect(code).toBe(1);
    expect(calls).toHaveLength(0);
    expect(readResult()).toMatchObject({ status: 'error', verdict: null });
  });

  it('never writes a secret value to stdout, stderr, the result file or a post body', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const boom = new Error(`bad key ${API_KEY} and token ${GH_TOKEN}`);
    await run(env(), { io: testIo(), fetch: okFetch(calls), makeLlm: () => llm(boom) });
    const resultText = execFileSync('cat', [resultPath], { encoding: 'utf8' });
    for (const text of [out.join('\n'), err.join('\n'), resultText]) {
      expect(text).not.toContain(API_KEY);
      expect(text).not.toContain(GH_TOKEN);
    }
    expect(err.join('\n')).toContain('***');
  });
  // AC-44: a secret the model echoes in a finding must not reach the log or the result file
  it('keeps a secret echoed in a finding out of stdout, stderr and the result file on a successful run', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    await run(env(), {
      io: testIo(),
      fetch: okFetch(calls),
      makeLlm: () => llm({ verdict: 'request_changes', summary: `see ${API_KEY}`, score: 10, findings: [finding('CRITICAL')] }),
    });
    const resultText = execFileSync('cat', [resultPath], { encoding: 'utf8' });
    for (const text of [out.join('\n'), err.join('\n'), resultText]) {
      expect(text).not.toContain(API_KEY);
      expect(text).not.toContain(GH_TOKEN);
    }
  });

  // a failed post is an error result; GitHub's response body (which can quote the request) is never echoed
  it('a failed post exits 1 with an error result and never echoes the response body or the token', async () => {
    const failing = (async () => new Response(`bad credentials ${GH_TOKEN}`, { status: 403 })) as unknown as typeof fetch;
    const code = await run(env(), {
      io: testIo(),
      fetch: failing,
      makeLlm: () => llm({ verdict: 'comment', summary: 's', score: 80, findings: [finding('WARNING')] }),
    });
    expect(code).toBe(1);
    expect(readResult()).toMatchObject({ status: 'error', error_class: 'GitHubPostError' });
    expect(out.join('\n') + err.join('\n')).not.toContain(GH_TOKEN);
  });

  // AC-37/AC-72: without a key (a fork PR run) the runner skips cleanly: exit 0, no result, no model
  it('skips with exit 0, no result file and no model call when the API key is absent', async () => {
    const code = await run(env({ OPENROUTER_API_KEY: '' }), {
      io: testIo(),
      makeLlm: () => { throw new Error('must not be called'); },
    });
    expect(code).toBe(0);
    expect(out.join('\n')).toMatch(/::notice::/);
    expect(existsSync(resultPath)).toBe(false);
  });

  // trust boundary: a manifest skill slug is never joined into a path unless it is a plain slug
  it.each([
    ['parent traversal', '../../etc/passwd'],
    ['a path separator', 'a/b'],
    ['an absolute path', '/etc/passwd'],
    ['a dot-dot name', '..'],
    ['an encoded traversal', '%2e%2e/x'],
    ['an upper-case name', 'Skill'],
  ])('rejects a skill slug with %s before reading any file and before a model call', async (_n, slug) => {
    writeFileSync(join(root, '.cfg/agents/sec.yaml'), MANIFEST.replace('skills: [s1]', `skills: [${JSON.stringify(slug)}]`));
    const reads: string[] = [];
    const io = testIo();
    const code = await run(env(), {
      io: { ...io, readText: async (p) => { reads.push(p); return io.readText(p); } },
      makeLlm: () => { throw new Error('must not be called'); },
    });
    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/skills/);
    expect(reads.some((p) => p.includes('passwd') || p.includes('..') || p.includes('%2e'))).toBe(false);
    expect(existsSync(resultPath)).toBe(false);
  });

  it('a manifest skill with no file fails naming the skill, without a model call', async () => {
    writeFileSync(join(root, '.cfg/agents/sec.yaml'), MANIFEST.replace('skills: [s1]', 'skills: [ghost]'));
    const code = await run(env(), { io: testIo(), makeLlm: () => { throw new Error('must not be called'); } });
    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(/ghost/);
  });

  // trust boundary: event fields reach git argv and the API URL, so they must be validated first
  it.each([
    ['an option-like SHA', { sha: '--output=/tmp/x', repo: 'acme/app' }],
    ['a short SHA', { sha: 'abc123', repo: 'acme/app' }],
    ['a repo name with traversal', { sha: 'a'.repeat(40), repo: 'acme/app/../../x' }],
  ])('rejects an event with %s before any git or network call', async (_n, bad) => {
    writeFileSync(
      join(root, 'event.json'),
      JSON.stringify({
        pull_request: {
          number: 5,
          base: { sha: bad.sha, repo: { full_name: bad.repo } },
          head: { sha: bad.sha, repo: { full_name: bad.repo } },
        },
      }),
    );
    const calls: { url: string; init: RequestInit }[] = [];
    const io = testIo();
    let gitCalled = false;
    const code = await run(env(), {
      io: { ...io, gitDiff: async (...a) => { gitCalled = true; return io.gitDiff(...a); } },
      fetch: okFetch(calls),
      makeLlm: () => { throw new Error('must not be called'); },
    });
    expect(code).toBe(1);
    expect(gitCalled).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('a non-https GITHUB_API_URL is refused and the token is never sent', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const code = await run(env({ GITHUB_API_URL: 'http://evil.test' }), {
      io: testIo(),
      fetch: okFetch(calls),
      makeLlm: () => llm({ verdict: 'comment', summary: 's', score: 80, findings: [finding('WARNING')] }),
    });
    expect(code).toBe(1);
    expect(calls).toHaveLength(0);
  });
});
