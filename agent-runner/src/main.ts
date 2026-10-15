// Runner entry: event -> skip checks -> manifest -> diff -> review -> post -> result -> exit code.
import { pathToFileURL } from 'node:url';
import {
  CiPostAs,
  type AgentManifest,
  type CiResultArtifact,
  type LLMProvider,
  type Review,
} from '@devdigest/shared';
import {
  OpenRouterProvider,
  ReviewChunksSkippedError,
  parseUnifiedDiff,
  reviewPullRequest,
} from '@devdigest/reviewer-core';
import {
  buildResult,
  exitCode,
  loadManifest,
  parseEvent,
  postPlan,
  shouldSkip,
  type ParsedEvent,
  type PostPlan,
} from './core.js';
import { nodeIo, type RunnerIo } from './io.js';

const RESULT_FILE = 'devdigest-result.json';
const SLUG = /^[a-z0-9][a-z0-9._-]{0,99}$/;

export interface RunnerDeps {
  io: RunnerIo;
  fetch: typeof fetch;
  makeLlm: (apiKey: string) => LLMProvider;
  now: () => number;
}

const defaultDeps = (): RunnerDeps => ({
  io: nodeIo,
  fetch: globalThis.fetch,
  makeLlm: (apiKey) => new OpenRouterProvider(apiKey),
  now: () => Date.now(),
});

/** Removes every known secret value from a string before it is printed or stored. */
function makeRedactor(env: NodeJS.ProcessEnv): (s: string) => string {
  const secrets = [env.OPENROUTER_API_KEY, env.GITHUB_TOKEN].filter((v): v is string => !!v);
  return (s) => secrets.reduce((acc, secret) => acc.split(secret).join('***'), s);
}

async function loadAgentConfig(io: RunnerIo, configDir: string) {
  const yamls = (await io.listDir(`${configDir}/agents`)).filter((n) => n.endsWith('.yaml')).sort();
  if (yamls.length !== 1) throw new Error(`expected exactly one agent manifest in ${configDir}/agents, found ${yamls.length}`);
  const manifest = loadManifest((await io.readText(`${configDir}/agents/${yamls[0]}`)) ?? '');
  const skills: string[] = [];
  for (const slug of manifest.skills) {
    if (!SLUG.test(slug)) throw new Error(`manifest invalid at skills: "${slug.slice(0, 40)}" is not a valid skill slug`);
    const body = await io.readText(`${configDir}/skills/${slug}.md`);
    if (body === null) throw new Error(`manifest invalid at skills: skill "${slug}" has no file`);
    skills.push(body);
  }
  const memory: string[] = [];
  for (const line of ((await io.readText(`${configDir}/memory.jsonl`)) ?? '').split('\n')) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line) as { content?: unknown };
      if (typeof item.content === 'string' && item.content) memory.push(item.content);
    } catch {
      // A broken memory line is context loss, not a reason to fail the review.
    }
  }
  return { manifest, skills, memory };
}

async function post(
  plan: PostPlan,
  event: ParsedEvent,
  env: NodeJS.ProcessEnv,
  doFetch: typeof fetch,
): Promise<void> {
  if (plan.kind === 'none') return;
  const token = env.GITHUB_TOKEN;
  if (!token) throw namedError('GitHubPostError', 'GITHUB_TOKEN is not available');
  const api = (env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
  if (!api.startsWith('https://')) throw namedError('GitHubPostError', 'GITHUB_API_URL must be https');
  const base = `${api}/repos/${event.baseRepo}`;
  const [url, body] =
    plan.kind === 'review'
      ? [`${base}/pulls/${event.number}/reviews`, { commit_id: event.headSha, ...plan.payload }]
      : [`${base}/issues/${event.number}/comments`, { body: plan.body }];
  const res = await doFetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'devdigest-agent-runner',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  // The response body is not echoed: it can quote the request.
  if (!res.ok) throw namedError('GitHubPostError', `GitHub responded ${res.status} to the ${plan.kind} post`);
}

function namedError(name: string, message: string): Error {
  const e = new Error(message);
  e.name = name;
  return e;
}

const EMPTY_REVIEW: Review = { verdict: 'approve', summary: 'No changes to review.', score: 100, findings: [] };

/** Runs the whole flow; resolves to the process exit code (it never throws). */
export async function run(env: NodeJS.ProcessEnv, overrides: Partial<RunnerDeps> = {}): Promise<number> {
  const deps = { ...defaultDeps(), ...overrides };
  const { io } = deps;
  const redact = makeRedactor(env);
  const fail = (msg: string): number => {
    io.stderr(redact(`::error::DevDigest: ${msg}`));
    return 1;
  };
  const started = deps.now();

  let event: ParsedEvent;
  let configDir: string;
  let workdir: string;
  try {
    const eventPath = env.GITHUB_EVENT_PATH;
    if (!eventPath) return fail('GITHUB_EVENT_PATH is not set');
    event = parseEvent((await io.readText(eventPath)) ?? '');
    configDir = env.DEVDIGEST_CONFIG_DIR || '.devdigest';
    workdir = env.DEVDIGEST_WORKDIR || '.';
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'cannot read the event');
  }

  const notice = shouldSkip({ event, apiKey: env.OPENROUTER_API_KEY });
  if (notice) {
    io.stdout(`::notice::${notice}`);
    return 0;
  }
  const postAs = CiPostAs.safeParse(env.DEVDIGEST_POST_AS || 'github_review');
  if (!postAs.success) return fail('DEVDIGEST_POST_AS must be github_review, pr_comment or none');

  let config: { manifest: AgentManifest; skills: string[]; memory: string[] };
  try {
    config = await loadAgentConfig(io, configDir);
  } catch (err) {
    // AC-38: no model call, no result; the job fails naming the field.
    return fail(err instanceof Error ? err.message : 'cannot load the manifest');
  }
  const { manifest } = config;

  let review: Review | null = null;
  let errorClass: string | null = null;
  let costUsd: number | null = null;
  let tokensIn = 0;
  let tokensOut = 0;
  try {
    const diff = parseUnifiedDiff(await io.gitDiff(workdir, event.baseSha, event.headSha));
    let plan: PostPlan;
    if (diff.files.length === 0) {
      review = EMPTY_REVIEW;
      plan = { kind: 'none' };
    } else {
      const outcome = await reviewPullRequest({
        systemPrompt: manifest.system_prompt,
        model: manifest.model,
        diff,
        llm: deps.makeLlm(env.OPENROUTER_API_KEY as string),
        strategy: manifest.strategy,
        skills: config.skills,
        memory: config.memory,
        task: `Review PR #${event.number}`,
        sessionId: env.GITHUB_RUN_ID ? `devdigest-ci-${env.GITHUB_RUN_ID}` : undefined,
      });
      review = outcome.review;
      costUsd = outcome.costUsd;
      tokensIn = outcome.tokensIn;
      tokensOut = outcome.tokensOut;
      plan = postPlan(postAs.data, review, { failOn: manifest.ci_fail_on, diff });
    }
    await post(plan, event, env, deps.fetch);
  } catch (err) {
    // AC-42: a failed review is an error result, never a clean one.
    errorClass = err instanceof ReviewChunksSkippedError ? 'ReviewChunksSkippedError' : err instanceof Error ? err.name : 'Error';
    io.stderr(redact(`::error::DevDigest review failed (${errorClass}): ${err instanceof Error ? err.message : 'unknown error'}`));
  }

  const result: CiResultArtifact = buildResult({
    review: errorClass === null ? review : null,
    failOn: manifest.ci_fail_on,
    errorClass,
    costUsd,
    durationMs: deps.now() - started,
    tokensIn,
    tokensOut,
    manifest: {
      schemaVersion: manifest.schema_version,
      agentName: manifest.name,
      agentVersion: manifest.agent_version,
      model: manifest.model,
    },
    runnerVersion: __RUNNER_VERSION__,
    deps: __DEPS__,
    nodeVersion: process.version,
    commitSha: event.headSha,
    runId: Number(env.GITHUB_RUN_ID) || 0,
    runAttempt: Number(env.GITHUB_RUN_ATTEMPT) || 1,
  });
  await io.writeText(RESULT_FILE, JSON.stringify(result));
  io.stdout(`DevDigest: ${result.status}, ${result.findings_count} finding(s)`);
  return exitCode(result);
}

// Run only as the entry of the bundle, not when a test imports `run`.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.env).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(`::error::DevDigest: unexpected failure (${err instanceof Error ? err.name : 'Error'})\n`);
      process.exitCode = 1;
    },
  );
}
