import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Per-repo review prompt template. A repo can ship `.devdigest/review-prompt.md`
 * to replace the default preamble; `{{agent}}` and `{{task}}` are substituted.
 */

export const DEFAULT_TEMPLATE = [
  'You are {{agent}}, reviewing a pull request.',
  '',
  'Task: {{task}}',
  '',
  'Report only issues you can point to in the diff.',
].join('\n');

export const TEMPLATE_PATH = '.devdigest/review-prompt.md';
export const TEMPLATE_MAX_CHARS = 4000;

export interface TemplateVars {
  agent: string;
  task: string;
}

export function loadTemplate(clonePath: string | undefined): string {
  if (!clonePath) return DEFAULT_TEMPLATE;
  const file = join(clonePath, TEMPLATE_PATH);
  if (!existsSync(file)) return DEFAULT_TEMPLATE;
  const text = readFileSync(file, 'utf8').slice(0, TEMPLATE_MAX_CHARS);
  return text.trim().length > 0 ? text : DEFAULT_TEMPLATE;
}

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{(agent|task)\}\}/g, (_, key: keyof TemplateVars) => vars[key]);
}

export function buildPreamble(clonePath: string | undefined, vars: TemplateVars): string {
  return renderTemplate(loadTemplate(clonePath), vars);
}
