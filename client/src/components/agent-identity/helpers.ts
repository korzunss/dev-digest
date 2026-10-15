import type { IconName } from "@devdigest/ui";

export interface AgentIdentityValue {
  icon: IconName;
  /** A CSS value — always one of the app's existing variables. */
  color: string;
}

/** Fixed palette (spec 013, AC-20). Order is part of the contract: reordering
   changes every agent's look. */
export const PALETTE: readonly AgentIdentityValue[] = [
  { icon: "Cpu", color: "var(--accent)" },
  { icon: "Shield", color: "var(--ok)" },
  { icon: "Bug", color: "var(--warn)" },
  { icon: "Zap", color: "var(--crit)" },
  { icon: "Brain", color: "var(--accent-text)" },
  { icon: "Target", color: "var(--text-secondary)" },
  { icon: "Code", color: "var(--info)" },
  { icon: "Wrench", color: "var(--pending)" },
];

/** Name keywords → a fitting icon (first match wins), so "Security Reviewer"
   always gets a shield. Names matching nothing fall back to the hashed palette. */
const KEYWORDS: readonly { re: RegExp; identity: AgentIdentityValue }[] = [
  { re: /secur/, identity: { icon: "Shield", color: "var(--crit)" } },
  { re: /perf/, identity: { icon: "Zap", color: "var(--warn)" } },
  { re: /mentor|junior/, identity: { icon: "Lightbulb", color: "var(--accent)" } },
  { re: /customer/, identity: { icon: "Users", color: "var(--accent-text)" } },
  { re: /architect/, identity: { icon: "Workflow", color: "var(--ok)" } },
  { re: /test/, identity: { icon: "FlaskConical", color: "var(--ok)" } },
  { re: /api|contract/, identity: { icon: "Globe", color: "var(--info)" } },
  { re: /general/, identity: { icon: "Boxes", color: "var(--text-secondary)" } },
];

/** Shown for a deleted agent (no name). */
export const NEUTRAL_IDENTITY: AgentIdentityValue = { icon: "Cpu", color: "var(--text-muted)" };

/** FNV-1a over the lower-cased name: stable across sessions and screens. */
function hash(name: string): number {
  let h = 0x811c9dc5;
  for (const ch of name.trim().toLowerCase()) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** The same name always yields the same icon and colour; `null` is neutral. */
export function agentIdentity(name: string | null | undefined): AgentIdentityValue {
  if (!name || !name.trim()) return NEUTRAL_IDENTITY;
  const key = name.trim().toLowerCase();
  const hit = KEYWORDS.find((k) => k.re.test(key));
  if (hit) return hit.identity;
  return PALETTE[hash(name) % PALETTE.length]!;
}
