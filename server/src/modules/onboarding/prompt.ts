import type { ChatMessage } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import { renderPrompt } from '../../platform/prompts.js';
import { ONBOARDING_LANGUAGE } from './constants.js';
import type { OnboardingFacts } from './types.js';

/**
 * The two messages of the one onboarding call.
 *
 * Every repo-derived string (names, scripts, endpoints, paths) goes inside ONE
 * `<untrusted>` block of the user message; the system prompt is a static
 * template whose only placeholder is the output language. No file contents are
 * ever included (AC-10) — the facts are names, counts and graph positions.
 */

/** The bounded fact set as the model sees it. */
export function boundedFacts(facts: OnboardingFacts) {
  const { clone } = facts;
  return {
    repo: facts.repoName,
    package_manager: clone.packageManager,
    stack: clone.stack,
    structure: clone.structure,
    package_dirs: clone.packageDirs,
    scripts: clone.scripts.map((s) => ({ dir: s.dir, name: s.name, command: s.command })),
    env_example: clone.envExample,
    compose_file: clone.composeFile,
    endpoints: facts.endpoints,
    reading_candidates: facts.readingRows.map((r) => ({
      path: r.path,
      rank_position: r.rank_position,
      importers: r.importers,
    })),
    critical_candidates: facts.criticalRows.map((r) => ({
      path: r.path,
      rank_position: r.rank_position,
      importers: r.importers,
      chain: r.chain,
    })),
    coverage: {
      files_indexed: facts.coverage.filesIndexed,
      source_files_total: facts.coverage.sourceFilesTotal,
      partial: facts.coverage.partial,
    },
  };
}

export async function buildOnboardingMessages(facts: OnboardingFacts): Promise<ChatMessage[]> {
  const system = await renderPrompt('onboarding.system.md', { language: ONBOARDING_LANGUAGE });
  const user = wrapUntrusted('onboarding-facts', JSON.stringify(boundedFacts(facts)));
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
