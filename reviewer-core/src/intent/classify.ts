import type {
  ChatMessage,
  CostSource,
  IntentSourceKind,
  LLMProvider,
  PromptSection,
} from '@devdigest/shared';
import { IntentClassification } from '@devdigest/shared';
import { INJECTION_GUARD, wrapUntrusted } from '../prompt.js';
import type { FileSummary } from './file-summaries.js';

/**
 * PR intent classification (spec 006) — a SEPARATE, cheap-model call that runs
 * before the main review. Pure: no fetch, no fs, no db. The server resolves
 * links/issues/docs and passes their CONTENT (or a redacted "unavailable"
 * reason) in; this module only builds the prompt and parses the structured
 * result, same contract as `reviewPullRequest`.
 */

// Caps (spec 006 S4, assumption) — keep the classifier prompt small and bound
// the blast radius of any one untrusted source.
export const INTENT_MAX_DESCRIPTION_CHARS = 4000;
export const INTENT_MAX_ISSUE_BODY_CHARS = 4000;
export const INTENT_MAX_DOC_CHARS = 6000;
export const INTENT_MAX_ISSUES = 3;
export const INTENT_MAX_DOCS = 3;
export const INTENT_MAX_FILES = 150;
export const INTENT_MAX_HEADERS_PER_FILE = 12;

const INTENT_SYSTEM_PROMPT =
  'You classify the INTENT and SCOPE of a pull request from its title, ' +
  'description, any linked issue, any linked doc/spec/plan, and the list of ' +
  'changed files with their diff hunk headers (no hunk bodies). Return: a ' +
  "short summary of what the PR is trying to do (`intent`), bullet lists of " +
  'what is `in_scope` and `out_of_scope`, and your `confidence` (high / ' +
  'medium / low) in that classification. If a listed source is marked ' +
  'unavailable, say so in your reasoning and NEVER invent its content — lower ' +
  'your confidence instead of guessing. With no description and no reachable ' +
  'linked source, confidence must be low.';

export interface IntentPromptIssue {
  ref: string;
  title: string;
  body: string;
}

export interface IntentPromptDoc {
  ref: string;
  content: string;
}

export interface IntentUnavailableSource {
  kind: IntentSourceKind;
  ref: string;
  reason: string;
}

export interface IntentPromptInput {
  title: string;
  description?: string;
  issues: IntentPromptIssue[];
  docs: IntentPromptDoc[];
  unavailable: IntentUnavailableSource[];
  files: FileSummary[];
}

export interface IntentPromptResult {
  messages: ChatMessage[];
  sections: PromptSection[];
}

export interface BuildIntentPromptOptions {
  /** Injected token counter; falls back to a chars/4 estimate when absent. */
  countTokens?: (s: string) => number;
}

function sectionFor(
  name: string,
  text: string,
  opts?: BuildIntentPromptOptions,
): PromptSection {
  return opts?.countTokens
    ? { name, chars: text.length, tokens: opts.countTokens(text), tokens_source: 'tokenizer' }
    : { name, chars: text.length, tokens: Math.ceil(text.length / 4), tokens_source: 'estimate' };
}

/**
 * Build the classifier's messages + section trace. Every untrusted block
 * (title, description, issue/doc content, unavailable-source refs, file list)
 * goes through `wrapUntrusted` — all of it is author- or repo-controlled.
 */
export function buildIntentPrompt(
  input: IntentPromptInput,
  opts?: BuildIntentPromptOptions,
): IntentPromptResult {
  const system = `${INTENT_SYSTEM_PROMPT}\n\n${INJECTION_GUARD}`;
  const sections: PromptSection[] = [];
  const userSections: string[] = [];

  userSections.push(`## PR title\n${wrapUntrusted('pr-title', input.title)}`);
  sections.push(sectionFor('pr_title', input.title, opts));

  const description = input.description?.trim();
  if (description && description.length > 0) {
    const capped = description.slice(0, INTENT_MAX_DESCRIPTION_CHARS);
    userSections.push(`## PR description\n${wrapUntrusted('pr-description', capped)}`);
    sections.push(sectionFor('pr_description', capped, opts));
  }

  const issues = input.issues.slice(0, INTENT_MAX_ISSUES);
  if (issues.length > 0) {
    const text = issues
      .map((i) => `### ${i.ref}: ${i.title}\n${i.body.slice(0, INTENT_MAX_ISSUE_BODY_CHARS)}`)
      .join('\n\n');
    userSections.push(`## Linked issue(s)\n${wrapUntrusted('linked-issue', text)}`);
    sections.push(sectionFor('linked_issue', text, opts));
  }

  const docs = input.docs.slice(0, INTENT_MAX_DOCS);
  if (docs.length > 0) {
    const text = docs
      .map((d) => `### ${d.ref}\n${d.content.slice(0, INTENT_MAX_DOC_CHARS)}`)
      .join('\n\n');
    userSections.push(`## Linked doc(s)\n${wrapUntrusted('linked-doc', text)}`);
    sections.push(sectionFor('linked_doc', text, opts));
  }

  if (input.unavailable.length > 0) {
    const text = input.unavailable.map((u) => `- ${u.kind} ${u.ref}: ${u.reason}`).join('\n');
    userSections.push(`## Unavailable sources\n${wrapUntrusted('unavailable-sources', text)}`);
    sections.push(sectionFor('unavailable_sources', text, opts));
  }

  const files = input.files.slice(0, INTENT_MAX_FILES);
  const fileText = files
    .map((f) => {
      const headers = f.headers.slice(0, INTENT_MAX_HEADERS_PER_FILE);
      return [`${f.path} (+${f.additions}/-${f.deletions})`, ...headers].join('\n');
    })
    .join('\n\n');
  userSections.push(`## Changed files\n${wrapUntrusted('file-list', fileText)}`);
  sections.push(sectionFor('file_list', fileText, opts));

  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: userSections.join('\n\n') },
  ];

  return { messages, sections };
}

export interface ClassifyIntentInput {
  llm: LLMProvider;
  model: string;
  input: IntentPromptInput;
  /** OpenRouter session grouping — same convention as reviewPullRequest. */
  sessionId?: string;
  countTokens?: (s: string) => number;
  /** Caller-owned cancellation, forwarded to the provider. */
  signal?: AbortSignal;
}

export interface ClassifyIntentResult {
  data: IntentClassification;
  sections: PromptSection[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  costSource: CostSource | null;
  model: string;
}

/**
 * Call the classifier. `requireParameters: true` is mandatory (spec 006 D2):
 * several OpenRouter endpoints for the default model lack structured outputs,
 * so routing must exclude them.
 */
export async function classifyIntent(args: ClassifyIntentInput): Promise<ClassifyIntentResult> {
  const { messages, sections } = buildIntentPrompt(args.input, { countTokens: args.countTokens });
  const res = await args.llm.completeStructured<IntentClassification>({
    model: args.model,
    schema: IntentClassification,
    schemaName: 'IntentClassification',
    messages,
    requireParameters: true,
    temperature: 0,
    maxRetries: 1,
    ...(args.sessionId ? { sessionId: args.sessionId } : {}),
    ...(args.signal ? { signal: args.signal } : {}),
  });
  return {
    data: res.data,
    sections,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: res.costUsd,
    costSource: res.costSource ?? null,
    model: res.model,
  };
}
