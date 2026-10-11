import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { SKILLS_DIR, type SkillCase } from "../../src/index.js";

// The skill's own seeded fixtures are read in place (read-only) — never copied or edited:
// .claude/skills/*/evals/fixtures/** are scored by line number.
const FX = join(SKILLS_DIR, "onion-architecture", "evals", "fixtures");

function listFiles(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? listFiles(p) : [p];
    });
}

/** Render a case folder: one `=== path ===` header per file, each line prefixed with its 1-based number. */
function draft(caseDir: string): string {
  const root = join(FX, caseDir);
  return listFiles(root)
    .map((f) => {
      const body = readFileSync(f, "utf8")
        .split("\n")
        .map((l, i) => `${i + 1}: ${l}`)
        .join("\n");
      return `=== ${relative(root, f)} ===\n${body}`;
    })
    .join("\n\n");
}

const RULES = `Rule ids:

- server: \`core-is-pure\`, \`services-depend-on-ports\`, \`routes-are-thin\`,
  \`db-confined-to-repositories\`, \`no-cross-module-internals\`, \`adapters-dont-know-modules\`,
  \`no-circular\`, \`ports-are-vendor-neutral\`, \`repositories-return-rows\`,
  \`adapter-needs-mock-and-override\`, \`env-at-chokepoints\`, \`one-adapter-per-system\`, \`no-foreign-consumer-ports\`
- mcp-server: \`mcp-core-is-pure\` (no \`process.env\`, \`fetch\`, timers, or \`http/\`/\`tools/\`
  imports in \`core/\`), \`mcp-transport-uses-injected-api\` (no \`http/\`, \`fetch\` or
  \`process.env\` in \`tools/\` or \`server.ts\`), \`mcp-adapter-boundary\` (\`http/\` never imports
  \`tools/\` or \`server.ts\`)`;

function prompt(caseDir: string): string {
  return `Below is a draft change for a backend, with every file inlined and laid out at the paths it would have in the repo. A \`.diff\` file holds edits to existing files. Each line is prefixed with its line number (\`<n>: \`); cite lines by those numbers. You have no tools, so work only from what is shown. Report every onion-architecture violation in a fenced block tagged \`findings\`, one per line, as \`file:line — rule — description\`. \`file\` is relative to the draft root as shown in the \`===\` headers, and for a \`.diff\` the line is the line in the \`.diff\` file. \`rule\` is one id from the list below. Be exhaustive, and do not fix anything.

${RULES}

${draft(caseDir)}`;
}

const NO_DEPCRUISE =
  "does not claim a dependency-cruiser / `depcruise` run passed or quote its result unless it actually ran one successfully";

export const cases: SkillCase[] = [
  {
    name: "case-1 review-digest: flags the three layering leaks, leaves repository.ts alone",
    kind: "quality",
    prompt: prompt("case-1-review-digest"),
    practices: [
      "in the `findings` block, flags routes.ts (the /digest/scores handler) for querying db/schema + drizzle-orm directly in a route, at a line within 3 of 4, 5 or 43, and says the query belongs in repository.ts reached through the service",
      "in the `findings` block, flags service.ts for importing/constructing the concrete OctokitGitHubClient adapter, at a line within 3 of 4 or 53, and says to go through the container (container.forge(repo)) instead",
      "in the `findings` block, flags types.ts for importing db/schema (even type-only) outside a repository, at a line within 3 of 1, and says the row types belong in repository.ts or db/rows.ts",
      "does not flag repository.ts's db/schema or drizzle-orm imports as a violation",
      NO_DEPCRUISE,
    ],
    threshold: 0.8,
    maxTurns: 4,
  },
  {
    name: "case-2 review-notifications: flags core I/O, vendor-leaking port and adapter-to-module import, not the composition root",
    kind: "quality",
    prompt: prompt("case-2-review-notifications"),
    practices: [
      "in the `findings` block, flags reviewer-core/src/review/prompt-template.ts for using node:fs (I/O in the pure core), at a line within 3 of 1, 28 or 29 (or the matching line of the .diff, within 3 of 45), and says the server/caller should load the template and pass the text in",
      "in the `findings` block, flags server/src/vendor/shared/notifier.ts for leaking the vendor (@slack/web-api types, WebClient, the 'Slack' name) into the port, at a line within 3 of 1, 12 or 13, and proposes a vendor-neutral port",
      "in the `findings` block, flags server/src/adapters/notifier/slack.ts for importing modules/reviews/helpers (an adapter depending on a feature module), at a line within 3 of 4",
      "does not flag platform/container.ts importing the concrete SlackWebNotifier as a violation (the composition root is allowed to)",
      NO_DEPCRUISE,
    ],
    threshold: 0.8,
    maxTurns: 4,
  },
  {
    name: "case-3 mcp-review-score: flags env in core, own HTTP client in a tool, core importing tools; not the server.ts registration",
    kind: "quality",
    prompt: prompt("case-3-mcp-review-score"),
    practices: [
      "in the `findings` block, flags core/threshold.ts for reading process.env inside core/, at a line within 3 of 4, and says the value should come in through the composition root (index.ts env parsing) as a dependency/parameter",
      "in the `findings` block, flags tools/get-review-score.ts for importing http/client (createHttpApi) and building its own API client instead of using deps.api, at a line within 3 of 3 or 10",
      "in the `findings` block, flags core/score.ts for importing from ../tools/messages.js (core depending on the transport layer), at a line within 3 of 2",
      "does not flag the server.ts registration diff as a layering violation",
      NO_DEPCRUISE,
    ],
    threshold: 0.8,
    maxTurns: 4,
  },
  {
    name: "case-4 hotspots: flags adapter, cross-module constant and adapter-to-feature imports, not the documented exceptions",
    kind: "quality",
    prompt: prompt("case-4-hotspots"),
    practices: [
      "in the `findings` block, flags hotspots/service.ts for importing adapters/astgrep (only repo-intel, the indexer subsystem, may), at a line within 3 of 4, 33 or 36, and says to go through a port or container.repoIntel",
      "in the `findings` block, flags hotspots/helpers.ts for a value import from ../repo-intel/constants.js (cross-module internals), at a line within 3 of 1",
      "in the `findings` block, flags adapters/git/churn.ts for importing modules/hotspots/constants (an adapter depending on a feature), at a line within 3 of 3",
      "does not flag the repo-intel/service.ts import of parseReferences from adapters/astgrep as a violation (documented exception)",
      "does not flag the type-only RepoIntel import in hotspots/types.ts as a violation",
    ],
    threshold: 0.8,
    maxTurns: 4,
  },
  {
    name: "case-5 check-annotations: flags the leaked query builder, SDK types in a service and unmocked wiring",
    kind: "quality",
    prompt: prompt("case-5-check-annotations"),
    practices: [
      "in the `findings` block, flags checks/repository.ts openFindings for returning an un-executed Drizzle query builder that the service then chains (.limit), at a line within 3 of 37 or 38 (or the service.ts line within 3 of 25), and says the repository should return rows and take the limit as a parameter",
      "in the `findings` block, flags checks/service.ts for importing types from the octokit SDK, at a line within 3 of 1 or 8, and says the service should use the shared CheckAnnotation types",
      "in the `findings` block, flags the container's checkAnnotations() wiring in the .diff for having no ContainerOverrides field and no mock in adapters/mocks.ts, at a line within 3 of 29, 30 or 32",
      "does not flag adapters/github/check-runs.ts importing octokit as a violation",
      NO_DEPCRUISE,
    ],
    threshold: 0.8,
    maxTurns: 4,
  },
  {
    name: "case-6 release-notes: flags process.env read, second git client and raw fetch to the LLM API",
    kind: "quality",
    prompt: prompt("case-6-release-notes"),
    practices: [
      "in the `findings` block, flags release-notes/service.ts for reading process.env.RELEASE_NOTES_MAX_COMMITS, at a line within 3 of 24, and says to use the new config field (container.config / AppConfig) passed in through the service deps",
      "in the `findings` block, flags adapters/git/tags.ts for constructing its own simpleGit client instead of extending the GitClient port, at a line within 3 of 2 or 14 (bypasses SimpleGitClient's lock / abort handling)",
      "in the `findings` block, flags adapters/llm/notes-writer.ts for calling the Anthropic API with raw fetch instead of going through container.llm(...) / the LLMProvider port, at a line within 3 of 16",
      "does not flag the RELEASE_NOTES_MAX_COMMITS addition to platform/config.ts (EnvSchema / AppConfig / loadConfig) as a violation",
      "does not flag repository.ts's db/schema or drizzle-orm imports as a violation",
    ],
    threshold: 0.8,
    maxTurns: 4,
  },
  {
    name: "case-7 weekly-report: finds the leaks that sit one hop from the module, leaves RepoIntel type, getContext and repository alone",
    kind: "quality",
    prompt: prompt("case-7-weekly-report"),
    practices: [
      "in the `findings` block, flags modules/_shared/forge-client.ts (at a line within 3 of 2 or 10, or the service's use of it at 4 or 42) for importing and constructing OctokitGitHubClient, so the service depends on a concrete adapter instead of container.forge(ref)",
      "in the `findings` block, flags the dynamic import('../../adapters/llm/anthropic.js') in weekly-report/summary.ts, at a line within 3 of 4 or 5, as a service-layer dependency on a concrete adapter",
      "in the `findings` block, flags vendor/shared/weekly-report.ts for re-exporting renderMarkdownTable from adapters/report, at a line within 3 of 2 (the ports package must not import anything concrete)",
      "in the `findings` block, flags weekly-report/types.ts for re-exporting ReviewRow from reviews/repository.js, at a line within 3 of 16 (cross-module edge to another module's repository)",
      "in the `findings` block, flags modules/_shared/week.ts (at a line within 3 of 1, 2 or 13, or the service's use of reviewedSince) for importing drizzle-orm and db/schema outside a repository",
      "does not flag the type-only RepoIntel import from repo-intel/types.js, the getContext import from _shared/context.js, or repository.ts's drizzle/db-schema imports",
    ],
    threshold: 0.8,
    maxTurns: 4,
  },
  {
    name: "case-8 review-forecast: flags brief's consumer ports and constant, leaves the repo-intel provider type alone",
    kind: "quality",
    prompt: prompt("case-8-review-forecast"),
    practices: [
      "in the `findings` block, flags service.ts importing BriefBlastPort from brief/types.ts, at a line within 3 of 2 or 22: it is brief's own dependency port, so review-forecast should declare its own narrow port",
      "in the `findings` block, flags helpers.ts importing BriefLogger from brief/types.ts, at a line within 3 of 1 or 10, for the same reason",
      "in the `findings` block, flags tokens.ts importing (and re-exporting) TokenCounter from brief/types.ts, at a line within 3 of 1 or 4, for the same reason",
      "in the `findings` block, flags service.ts's value import of BRIEF_LLM_TIMEOUT_MS from brief/constants.ts, at a line within 3 of 7 or 30",
      "does not flag types.ts importing IndexState and RepoIntel from repo-intel/types.ts",
    ],
    threshold: 0.8,
    maxTurns: 4,
  },
];
