import type { Agent, CiFailOn, Provider, ReviewStrategy } from "@devdigest/shared";

/** The Config-tab fields that, when changed, make the server append a version. */
export interface VersionedFormFields {
  provider: Provider;
  model: string;
  system_prompt: string;
  strategy: ReviewStrategy;
  ci_fail_on: CiFailOn;
  repo_intel: boolean;
}

/**
 * Whether saving this form would create a new agent version. Mirrors the
 * server's rule: name, description and the enabled toggle never version, so a
 * note offered for them would be silently dropped.
 */
export function wouldCreateVersion(agent: Agent, form: VersionedFormFields): boolean {
  return (
    form.provider !== agent.provider ||
    form.model !== agent.model ||
    form.system_prompt !== agent.system_prompt ||
    form.strategy !== agent.strategy ||
    form.ci_fail_on !== agent.ci_fail_on ||
    form.repo_intel !== agent.repo_intel
  );
}

/** The note to send: only when the save versions and the note is not blank. */
export function noteToSend(creates: boolean, note: string): string | undefined {
  const trimmed = note.trim();
  return creates && trimmed !== "" ? trimmed : undefined;
}
