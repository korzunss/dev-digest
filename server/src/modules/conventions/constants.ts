/** Tunables for the conventions extractor (spec 004). */

/** Top-N ranked source files asked of `repoIntel.getConventionSamples()`. */
export const TOP_FILES = 12;

/**
 * Config files sampled ALONGSIDE the ranked source. They have to be collected
 * separately because `repo-intel`'s `JUNK_PATH_PATTERNS` deliberately drops
 * `eslint`, `prettier` and `.config.` from rank-driven samples — the very files
 * that state a repo's rules out loud.
 */
export const CONFIG_ALLOWLIST = [
  'package.json',
  'tsconfig.json',
  '.editorconfig',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  'prettier.config.js',
  'prettier.config.mjs',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.cjs',
  '.eslintrc.js',
  'biome.json',
  'biome.jsonc',
] as const;

/** How deep the config walk descends from the clone root. */
export const CONFIG_WALK_DEPTH = 2;

/** Extensions the fallback walk considers source (repo-intel degraded/unindexed). */
export const FALLBACK_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.py',
  '.go',
  '.rb',
  '.rs',
  '.java',
  '.kt',
] as const;

/** Directories the fallback walk never descends into. */
export const FALLBACK_SKIP_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  'vendor',
  '__pycache__',
  'target',
] as const;

/** Depth cap for the fallback walk — deep trees are not more representative. */
export const FALLBACK_WALK_DEPTH = 4;

/** Per-file caps. Truncation always lands on a line boundary (never mid-line,
 *  or a citation could point at half a statement). */
export const MAX_SAMPLE_BYTES = 24_000;
export const MAX_SAMPLE_LINES = 400;

/** Total files shown to the model, configs included. */
export const MAX_SAMPLE_FILES = 20;

/** Hard cap on what the model may propose in one pass. */
export const MAX_CANDIDATES = 24;

/** `StructuredRequest.schemaName` — the key `MockLLMProvider.structuredBySchema` uses. */
export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';

/** Lines of the cited construct kept as evidence, counting from the match. */
export const SNIPPET_MAX_LINES = 12;
