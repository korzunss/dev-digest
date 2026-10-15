import { stringify, parse } from 'yaml';
import { zipSync, strToU8 } from 'fflate';
import { AgentManifest, AGENT_MANIFEST_SCHEMA_VERSION } from '@devdigest/shared';
import type { CiFile, CiFailOn, CiInstallErrorCode, Provider } from '@devdigest/shared';
import { MEMORY_PATH, RUNNER_PATH, WORKFLOW_PATH } from './constants.js';

/** Pure builders for the export bundle (no I/O). */

export interface ExportAgent {
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: 'auto' | 'single-pass' | 'map-reduce';
  ciFailOn: CiFailOn;
}

export interface BuildExportInput {
  agent: ExportAgent;
  version: number;
  skills: { name: string; body: string }[];
  memory: { kind: string; content: string }[];
  workflow: string;
  runnerJs: string;
}

export type BuildExportResult =
  | { ok: true; files: CiFile[] }
  | { ok: false; blocked: { code: CiInstallErrorCode; message: string; field?: string } };

/** `Code Review!` → `code-review`; path-safe, never empty. */
export function slugify(name: string, fallback: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return s || fallback;
}

/** Slugs for `names`, in order; collisions get `-2`, `-3`, … suffixes. */
export function uniqueSlugs(names: string[], fallback = 'skill'): string[] {
  const used = new Set<string>();
  return names.map((n) => {
    const base = slugify(n, fallback);
    let slug = base;
    for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
    used.add(slug);
    return slug;
  });
}

/** Version line of a verified runner bundle (`// devdigest-agent-runner vX sha256:…`). */
export function runnerVersionOf(js: string): string | null {
  const m = /^\/\/ devdigest-agent-runner v(\S+) sha256:[0-9a-f]{64}(?:\r?\n|$)/.exec(js);
  return m ? (m[1] ?? null) : null;
}

export function buildExportFiles(input: BuildExportInput): BuildExportResult {
  const { agent } = input;
  const skillSlugs = uniqueSlugs(input.skills.map((s) => s.name));
  const agentSlug = slugify(agent.name, 'agent');

  const yamlText = stringify({
    schema_version: AGENT_MANIFEST_SCHEMA_VERSION,
    agent_version: input.version,
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.systemPrompt,
    skills: skillSlugs,
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
  });
  const check = AgentManifest.safeParse(parse(yamlText));
  if (!check.success) {
    const field = check.error.issues[0]?.path.join('.') || 'manifest';
    return {
      ok: false,
      blocked: { code: 'manifest_invalid', message: `Agent manifest is invalid at "${field}"`, field },
    };
  }

  const memory = input.memory.map((m) => JSON.stringify({ kind: m.kind, content: m.content })).join('\n');
  const files: CiFile[] = [
    { path: `.devdigest/agents/${agentSlug}.yaml`, contents: yamlText, editable: false },
    ...input.skills.map((s, i) => ({
      path: `.devdigest/skills/${skillSlugs[i]}.md`,
      contents: s.body,
      editable: false,
    })),
    { path: MEMORY_PATH, contents: memory ? `${memory}\n` : '', editable: false },
    { path: RUNNER_PATH, contents: input.runnerJs, editable: false },
    { path: WORKFLOW_PATH, contents: input.workflow, editable: true },
  ];
  return { ok: true, files };
}

/** Markdown body of the export PR: files + the manual review checklist (AC-27). */
export function prBody(files: CiFile[], repo: string): string {
  return [
    `Adds DevDigest CI review to \`${repo}\`. This PR creates ${files.length} files:`,
    '',
    ...files.map((f) => `- \`${f.path}\``),
    '',
    '## Review checklist',
    '- [ ] Workflow permissions are only `contents: read` and `pull-requests: write`.',
    '- [ ] Trigger events are only the `pull_request` types you chose.',
    '- [ ] PR code is only read as a diff; the runner, manifest, skills and memory come from the base commit and never from the PR head.',
    '- [ ] Add `OPENROUTER_API_KEY` under Settings > Secrets and variables > Actions.',
    '- [ ] Protect `.github/` and `.devdigest/` with CODEOWNERS and a ruleset: for `pull_request` events GitHub runs the workflow file from the PR itself.',
    '',
    'This PR\'s own workflow run skips with a notice, because the base branch has no `.devdigest/runner/index.js` yet. Changes to `.devdigest/` take effect after merge.',
    '',
  ].join('\n');
}

export function zipFiles(files: CiFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.path] = strToU8(f.contents);
  return zipSync(entries);
}
