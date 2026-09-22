/**
 * Demo skills for a freshly seeded workspace, and which agent each one is
 * attached to.
 *
 * These exist so the "with skills / without skills" comparison is reproducible
 * from `pnpm db:seed` rather than depending on someone hand-typing a rubric.
 * Every one is `source: 'manual'` and enabled: they were written here, so they
 * need no vetting — an imported skill is the one that lands disabled.
 */

import type { SkillType } from '@devdigest/shared';

export interface SeedSkill {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export const SEED_SKILLS: SeedSkill[] = [
  {
    name: 'pr-quality-rubric',
    description: 'Judge a PR on blast radius and reversibility before style.',
    type: 'rubric',
    body: `# PR quality rubric

Weigh a change on these, in order. An earlier item outranks a later one.

1. **Blast radius** — how many callers, tenants, or stored rows does this touch
   if it is wrong? A defect on a shared path outranks a worse defect on a leaf.
2. **Reversibility** — can this be rolled back cleanly? A data migration and a
   changed on-the-wire contract cannot; a pure code change can.
3. **Detectability** — would anything fail if this were wrong? A silent wrong
   answer is worse than a crash.
4. **Locality** — is the change explicable from the diff alone, or does it rely
   on invariants held somewhere the reviewer cannot see?

Style, naming and formatting are below all four. Do not lead with them.`,
  },
  {
    name: 'no-then-chains',
    description: 'Reject .then() chains in new code; require async/await.',
    type: 'convention',
    body: `# async/await, not .then()

New code in this repo uses \`async\`/\`await\`. Flag a \`.then()\` chain added by the
diff, and flag these specifically because they read as correct:

- \`forEach\` with an async callback — the loop does not wait, and a rejection
  inside it is unhandled.
- A promise stored and awaited later, past the point its result is used.
- \`.catch()\` that returns a value, silently converting a failure into a success.

\`Promise.all\` / \`Promise.allSettled\` for genuine concurrency is fine and is not
what this rule is about.`,
  },
  {
    name: 'secret-leakage-gate',
    description: 'Block any credential that would be committed by this diff.',
    type: 'security',
    body: `# Secret leakage gate

Treat as CRITICAL any credential introduced by the diff, including:

- literal keys (\`sk_live\`, \`ghp_\`, \`service_role\`, a private-key PEM block);
- a secret put behind a \`NEXT_PUBLIC_\` env var, which ships it to the browser;
- a credential written into a log line, an error message, a test fixture, or a
  committed \`.env\`.

In this repo secrets never touch the DB or the config object — they live in
\`~/.devdigest/secrets.json\` and are read through one chokepoint. A diff that
reads a secret anywhere else is a finding even if the value itself is absent.`,
  },
  {
    name: 'lethal-trifecta',
    description: 'Flag private data + untrusted input + an exfiltration path together.',
    type: 'security',
    body: `# The lethal trifecta

Report a CRITICAL when one code path combines all three:

1. **Private data** in scope — a secret, a token, another tenant's rows.
2. **Untrusted input** reaching it — PR text, repo contents, a model's output, a
   user-supplied URL or filename.
3. **An exfiltration path** — an outbound request, a log sink, a rendered
   response, a file write.

Name all three in the finding, with the file and line for each. Any two of them
without the third is at most a WARNING: state which leg is missing and why it
would take another change to complete.`,
  },
  {
    name: 'test-coverage-nudge',
    description: 'Demand a test for every branch the diff introduces.',
    type: 'custom',
    body: `# Cover the branches this diff adds

For each conditional, guard, \`catch\`, early return or default introduced by the
change, find the assertion that reaches it. If there is none, that is a finding —
name the branch and the input that would reach it.

Pay particular attention to the cases authors skip:

- the empty collection, zero, and null — distinct from each other;
- the second call (already exists, already linked, already running);
- the failure path of anything that can fail;
- the distinction the code makes but the test does not ("absent" vs "zero",
  "disabled" vs "deleted").

A test that asserts a mock was called is not coverage of the branch.`,
  },
  {
    name: 'phantom-api-gate',
    description: 'Flag calls to functions, fields or endpoints that do not exist.',
    type: 'custom',
    body: `# No phantom APIs

Flag a call the diff makes to something it cannot show exists:

- a method or field on an object whose shape is visible in the diff or the repo
  map and does not have it;
- an endpoint path or query parameter with no route to match it;
- a config key, env var or contract field that appears nowhere else;
- an import from a module that does not export that name.

Quote the line that uses it and the line that should have defined it. If you
cannot see the definition either way, say so and drop the severity to WARNING —
a missing definition you cannot confirm is a question, not a defect.`,
  },
  {
    name: 'contract-change-gate',
    description: 'Treat a changed request or response shape as a break until proven otherwise.',
    type: 'convention',
    body: `# Changed contract = breaking until proven otherwise

When the diff changes a route's params, body, response, status code or error
\`code\` string, assume an existing caller depends on the old shape and look for
the update that keeps it working. If the caller is not in the diff, report it.

Specifically breaking:

- a request field that becomes required or narrows its accepted values (old
  payloads now 422);
- a response field removed, renamed, re-typed or made nullable;
- a required key added to a schema that also parses PERSISTED documents — rows
  written before the change stop parsing. Widening an enum is safe; requiring a
  key is not.

Contracts here are vendored into two trees. A schema edited in one copy and not
the other is itself the break.`,
  },
];

/** Which demo skills each seeded agent runs with, in prompt order. */
export const SEED_AGENT_SKILLS: Record<string, string[]> = {
  'General Reviewer': ['pr-quality-rubric', 'no-then-chains'],
  'Security Reviewer': ['secret-leakage-gate', 'lethal-trifecta'],
  'Test Quality Reviewer': ['test-coverage-nudge', 'pr-quality-rubric'],
  'API Contract Reviewer': ['contract-change-gate', 'phantom-api-gate'],
};
