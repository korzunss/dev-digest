import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Smart Diff (spec 007) — classification data for `classifyFile`.
 *
 * Two orders, deliberately different:
 * - `SMART_DIFF_ROLE_ORDER` is the DISPLAY order (core first, boilerplate last).
 * - `SMART_DIFF_RULES` is the EVALUATION order (first match wins): boilerplate
 *   is checked before tests, tests before wiring, wiring before docs. `core`
 *   is the fallback when nothing else matches, so it carries no rule.
 *
 * That evaluation order is why `__tests__/__snapshots__/x.snap` classifies as
 * boilerplate (its `__snapshots__` segment is checked before the `__tests__`
 * segment), and why `e2e/README.md` classifies as tests, not docs.
 *
 * Directory-segment rules match at any depth (D8): `path.split('/')` minus the
 * last part, compared for an exact segment, never a substring — so
 * `src/tests-utils/a.ts` and `docs-site/app.ts` fall through to `core`.
 */

export const SMART_DIFF_ROLE_ORDER = [
  'core',
  'tests',
  'wiring',
  'docs',
  'boilerplate',
] as const satisfies readonly SmartDiffRole[];

/** A single classification rule. All lists are OR'd together within a rule. */
export interface SmartDiffRule {
  role: SmartDiffRole;
  /** Exact basename match. */
  basenames?: readonly string[];
  /** Basename ends with one of these. */
  basenameSuffixes?: readonly string[];
  /** Basename starts with one of these. */
  basenamePrefixes?: readonly string[];
  /** Basename contains one of these as a substring. */
  basenameIncludes?: readonly string[];
  /** Any directory segment (path minus basename) equals one of these. */
  segments?: readonly string[];
  /** Basename starts with `prefix` AND ends with `suffix`. */
  prefixSuffix?: readonly { prefix: string; suffix: string }[];
}

export const SMART_DIFF_RULES: readonly SmartDiffRule[] = [
  {
    role: 'boilerplate',
    basenameSuffixes: ['.lock', '.snap', '.min.js', '.d.ts'],
    basenames: ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'],
    basenameIncludes: ['.generated.'],
    segments: ['dist', 'build', '__snapshots__'],
  },
  {
    role: 'tests',
    basenameSuffixes: ['.test.ts', '.test.tsx', '.spec.ts'],
    segments: ['test', 'tests', '__tests__', 'e2e'],
  },
  {
    role: 'wiring',
    basenames: ['index.ts', 'index.js', 'package.json'],
    basenameIncludes: ['.config.'],
    prefixSuffix: [
      { prefix: 'tsconfig', suffix: '.json' },
      { prefix: 'docker-compose', suffix: '.yml' },
    ],
    basenamePrefixes: ['.eslintrc', '.env'],
    segments: ['.github', '.claude'],
  },
  {
    role: 'docs',
    basenameSuffixes: ['.md'],
    segments: ['docs'],
    basenamePrefixes: ['README', 'CHANGELOG', 'LICENSE.'],
    basenames: ['LICENSE'],
  },
];
